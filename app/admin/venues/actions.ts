"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { REGIONS } from "@/lib/constants";
import { logStatus } from "@/lib/history";
import { PRICE_RANGES } from "@/lib/options";

export type AdminState = { error?: string; ok?: string } | undefined;

// A-3 식당 등록 (+ 첫 수용 인원)
export async function createVenue(_: AdminState, fd: FormData): Promise<AdminState> {
  const { supabase, profile } = await requireAdmin();
  const name = String(fd.get("name") ?? "").trim();
  const region = String(fd.get("region") ?? "");
  const address = String(fd.get("address") ?? "").trim();
  const mapUrl = String(fd.get("map_url") ?? "").trim();
  const priceRange = String(fd.get("price_range") ?? "");
  const rating = Number(fd.get("rating"));
  if (!name || name.length > 40) return { error: "식당명을 40자 이내로 입력해 주세요." };
  if (!(region in REGIONS)) return { error: "지역을 골라 주세요." };
  if (mapUrl && !/^https?:\/\//.test(mapUrl)) return { error: "지도 링크는 http로 시작해야 해요." };
  if (!(PRICE_RANGES as readonly string[]).includes(priceRange)) return { error: "가격대를 골라 주세요." };
  if (!(rating >= 0 && rating <= 5)) return { error: "평점은 0~5 사이로 입력해 주세요." };

  const { data: venue, error } = await supabase
    .from("venues")
    .insert({ name, region, address: address || null, map_url: mapUrl || null, price_range: priceRange, rating })
    .select("id")
    .single();
  if (error || !venue) return { error: `식당을 등록하지 못했어요: ${error?.message ?? ""}` };

  const res = await addAvailabilityRow(supabase, venue.id, fd);
  await logStatus(supabase, {
    entity: "venue", entityId: venue.id, field: "created", from: null, to: name,
    actor: "ADMIN", actorProfileId: profile?.id, reason: "식당 등록",
  });
  revalidatePath("/admin/venues");
  if (res?.startsWith("!")) return { error: `${name}은(는) 등록했지만 수용 인원은 열지 못했어요: ${res.slice(1)}` };
  return { ok: `${name}을(를) 등록했어요.${res ? ` ${res}` : ""}` };
}

// 기존 식당에 날짜·시간별 수용 인원 추가
export async function addAvailability(_: AdminState, fd: FormData): Promise<AdminState> {
  const { supabase } = await requireAdmin();
  const venueId = String(fd.get("venue_id") ?? "");
  if (!venueId) return { error: "식당을 골라 주세요." };
  const res = await addAvailabilityRow(supabase, venueId, fd, true);
  if (res?.startsWith("!")) return { error: res.slice(1) };
  revalidatePath("/admin/venues");
  return { ok: res ?? "추가했어요." };
}

async function addAvailabilityRow(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], venueId: string, fd: FormData, required = false,
): Promise<string | null> {
  const date = String(fd.get("slot_date") ?? "");
  const time = String(fd.get("start_time") ?? "");
  const capacity = Number(fd.get("venue_capacity"));
  if (!date && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return "!날짜와 시간을 입력해 주세요.";
  if (!Number.isInteger(capacity) || capacity < 4 || capacity > 100) return "!수용 인원은 4~100명 사이로 입력해 주세요.";
  const { data: dup } = await supabase.from("venue_availability").select("id")
    .eq("venue_id", venueId).eq("slot_date", date).eq("start_time", `${time}:00`).limit(1);
  if (dup && dup.length > 0) return "!이미 같은 날짜·시간 수용 인원이 있어요.";
  const { error } = await supabase.from("venue_availability")
    .insert({ venue_id: venueId, slot_date: date, start_time: time, capacity });
  if (error) return `!수용 인원을 저장하지 못했어요: ${error.message}`;
  return `${date} ${time} · ${capacity}명 수용 인원을 열었어요.`;
}

// 예약 가능 ↔ 마감 (이미 테이블에 배정된 RESERVED는 바꾸지 않는다)
export async function toggleAvailability(fd: FormData) {
  const { supabase, profile } = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const to = String(fd.get("to") ?? "");
  if (to !== "AVAILABLE" && to !== "CLOSED") return;
  const from = to === "AVAILABLE" ? "CLOSED" : "AVAILABLE";
  const { data } = await supabase.from("venue_availability").update({ reservation_status: to })
    .eq("id", id).eq("reservation_status", from).select("id");
  if (data && data.length > 0) {
    await logStatus(supabase, {
      entity: "venue_availability", entityId: id, field: "reservation_status", from, to,
      actor: "ADMIN", actorProfileId: profile?.id,
    });
  }
  revalidatePath("/admin/venues");
}

const WEIGHT_KEYS = ["w_age", "w_gender", "w_mbti", "w_interest", "w_wanted", "w_new_people"] as const;

// 매칭 가중치·최소 점수 (MAT-15). 필수 조건은 설정으로 바꿀 수 없다.
export async function saveMatchingSettings(_: AdminState, fd: FormData): Promise<AdminState> {
  const { supabase, profile } = await requireAdmin();
  const next: Record<string, number> = {};
  for (const k of [...WEIGHT_KEYS, "min_score"] as const) {
    const v = Number(fd.get(k));
    if (!Number.isInteger(v) || v < 0 || v > 100) return { error: "모든 값은 0~100 사이 정수로 입력해 주세요." };
    next[k] = v;
  }
  const sum = WEIGHT_KEYS.reduce((s, k) => s + next[k], 0);
  if (sum !== 100) return { error: `가중치 합이 100이 되어야 해요. 지금 합: ${sum}` };

  const { data: cur } = await supabase.from("matching_settings").select("*").eq("scope", "GLOBAL").single();
  if (!cur) return { error: "기본 매칭 설정을 찾지 못했어요." };
  const { error } = await supabase.from("matching_settings")
    .update({ ...next, updated_by: profile?.id ?? null, updated_at: new Date().toISOString() })
    .eq("id", cur.id);
  if (error) return { error: `저장하지 못했어요: ${error.message}` };

  const changed = [...WEIGHT_KEYS, "min_score"].filter((k) => cur[k] !== next[k]);
  if (changed.length > 0) {
    await logStatus(supabase, changed.map((k) => ({
      entity: "matching_settings" as const, entityId: cur.id, field: k, from: String(cur[k]), to: String(next[k]),
      actor: "ADMIN" as const, actorProfileId: profile?.id, reason: "매칭 설정 변경",
    })));
  }
  revalidatePath("/admin/venues");
  return { ok: changed.length ? `저장했어요. 다음 자동 매칭부터 적용돼요. (${changed.length}개 항목 변경)` : "바뀐 값이 없어요." };
}
