"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { REGIONS } from "@/lib/constants";
import { logStatus } from "@/lib/history";
import { deadlineForEvent, fmtDeadline, fmtEventDate } from "@/lib/time";

export type AdminState = { error?: string; ok?: string } | undefined;

const VENUE_CAPACITY_DEFAULT = 18;

// A-2 새 회차 만들기: 날짜·시간 × 고른 지역마다 회차를 만든다.
// 신청·환불·자동 매칭 마감은 행사 직전 화요일 24:00으로 자동 계산한다 (MVP 6장).
export async function createSlots(_: AdminState, formData: FormData): Promise<AdminState> {
  const { supabase, profile } = await requireAdmin();
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const regions = formData.getAll("regions").map(String).filter((r) => r in REGIONS);
  const capacity = Number(formData.get("capacity"));
  const openVenues = formData.get("open_venues") === "on";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "날짜를 골라 주세요." };
  if (!/^\d{2}:\d{2}$/.test(time)) return { error: "시간을 입력해 주세요." };
  if (regions.length === 0) return { error: "지역을 하나 이상 골라 주세요." };
  if (!Number.isInteger(capacity) || capacity < 4 || capacity > 200) return { error: "정원은 4~200명 사이로 입력해 주세요." };

  const deadline = deadlineForEvent(date);
  if (new Date(deadline) <= new Date())
    return { error: `신청 마감(${fmtDeadline(deadline)})이 이미 지난 날짜예요. 더 뒤의 날짜를 골라 주세요.` };

  const { data: existing } = await supabase
    .from("event_slots").select("region").eq("event_date", date).eq("start_time", `${time}:00`);
  const taken = new Set((existing ?? []).map((s) => s.region));
  const fresh = regions.filter((r) => !taken.has(r));
  if (fresh.length === 0) return { error: "고른 지역에는 이미 같은 날짜·시간 회차가 있어요." };

  const { data: created, error } = await supabase
    .from("event_slots")
    .insert(fresh.map((region) => ({
      event_date: date, start_time: time, region, capacity, apply_deadline: deadline, match_at: deadline,
    })))
    .select("id, region");
  if (error || !created) return { error: `회차를 만들지 못했어요: ${error?.message ?? "알 수 없는 오류"}` };

  // 그 날짜에 해당 지역 식당 수용 인원도 함께 연다 (식당 자동 배정에 필요)
  let venueNote = "";
  if (openVenues) {
    const { data: venues } = await supabase.from("venues").select("id, region").in("region", fresh);
    const { data: avail } = await supabase
      .from("venue_availability").select("venue_id").eq("slot_date", date).eq("start_time", `${time}:00`);
    const has = new Set((avail ?? []).map((a) => a.venue_id));
    const rows = (venues ?? []).filter((v) => !has.has(v.id))
      .map((v) => ({ venue_id: v.id, slot_date: date, start_time: time, capacity: VENUE_CAPACITY_DEFAULT }));
    if (rows.length > 0) {
      const { error: vErr } = await supabase.from("venue_availability").insert(rows);
      venueNote = vErr ? " (식당 수용 인원은 열지 못했어요)" : ` · 식당 ${rows.length}곳 수용 인원 ${VENUE_CAPACITY_DEFAULT}명씩 열림`;
    }
  }

  await logStatus(supabase, created.map((s) => ({
    entity: "event_slot" as const, entityId: s.id, field: "status", from: null, to: "OPEN",
    actor: "ADMIN" as const, actorProfileId: profile?.id, reason: "회차 생성",
  })));
  revalidatePath("/admin/slots");
  const skipped = regions.length - fresh.length;
  return {
    ok: `${fmtEventDate(date)} ${time} 회차 ${created.length}개를 만들었어요${skipped ? ` (이미 있는 ${skipped}개 제외)` : ""}${venueNote}.`,
  };
}

// 모집 마감 / 다시 열기 (매칭이 시작된 회차는 바꾸지 않는다)
export async function toggleSlot(formData: FormData) {
  const { supabase, profile } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const to = String(formData.get("to") ?? "");
  if (to !== "OPEN" && to !== "CLOSED") return;
  const from = to === "OPEN" ? "CLOSED" : "OPEN";
  const { data } = await supabase.from("event_slots").update({ status: to }).eq("id", id).eq("status", from).select("id");
  if (data && data.length > 0) {
    await logStatus(supabase, {
      entity: "event_slot", entityId: id, field: "status", from, to,
      actor: "ADMIN", actorProfileId: profile?.id, reason: to === "CLOSED" ? "운영자 모집 마감" : "운영자 다시 열기",
    });
  }
  revalidatePath("/admin/slots");
}

// 정원 변경 (모집 중인 회차만). 식당 좌석보다 크게 잡으면 식당 배정 실패 예외가 생길 수 있다.
export async function updateCapacity(formData: FormData) {
  const { supabase, profile } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const capacity = Number(formData.get("capacity"));
  if (!Number.isInteger(capacity) || capacity < 4 || capacity > 200) return;
  const { data: cur } = await supabase.from("event_slots").select("capacity").eq("id", id).eq("status", "OPEN").maybeSingle();
  if (!cur || cur.capacity === capacity) return;
  await supabase.from("event_slots").update({ capacity }).eq("id", id).eq("status", "OPEN");
  await logStatus(supabase, {
    entity: "event_slot", entityId: id, field: "capacity", from: String(cur.capacity), to: String(capacity),
    actor: "ADMIN", actorProfileId: profile?.id, reason: "정원 변경",
  });
  revalidatePath("/admin/slots");
}
