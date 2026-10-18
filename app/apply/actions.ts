"use server";

import { redirect } from "next/navigation";
import { requireParticipant } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLatestApplication, isOngoing } from "@/lib/applications";
import { logStatus } from "@/lib/history";
import { notify } from "@/lib/notify";
import { REGIONS } from "@/lib/constants";
import { fmtDeadline } from "@/lib/time";

export type ApplyState = { error?: string; dates?: string[]; regions?: string[] } | undefined;

// P-3 신청서 제출: 고른 날짜 × 지역 조합을 회차 후보로 저장한다.
export async function submitApplication(_: ApplyState, formData: FormData): Promise<ApplyState> {
  const { supabase, profile } = await requireParticipant();
  const dates = formData.getAll("dates").map(String);
  const regions = formData.getAll("regions").map(String).filter((r) => r in REGIONS);
  const keep = { dates, regions };

  if (dates.length === 0) return { error: "참가 가능한 날짜를 하나 이상 골라 주세요.", ...keep };
  if (regions.length === 0)
    return { error: "희망 지역을 하나 이상 골라 주세요. 지금은 서울 4개 지역에서만 모임을 열어요.", ...keep };

  // 이용 제한 (노쇼·당일 취소 누적, MVP 6장)
  if (profile.restriction_level >= 3) return { error: "이용이 제한된 계정이에요. 운영팀에 문의해 주세요.", ...keep };
  if (profile.restricted_until && new Date(profile.restricted_until) > new Date())
    return { error: `${fmtDeadline(profile.restricted_until)}까지 참가가 제한돼 있어요.`, ...keep };

  // 한 번에 하나의 신청만 진행한다 (같은 사람을 두 테이블에 배치하지 않기 위해)
  const latest = await getLatestApplication(supabase, profile.id);
  if (isOngoing(latest)) {
    if (latest!.payment_status === "PENDING") redirect(`/apply/${latest!.id}/pay`);
    return { error: "이미 진행 중인 신청이 있어요. 홈에서 상태를 확인해 주세요.", ...keep };
  }

  // 신청 가능한 회차만 (모집 중이고 마감 전)
  const { data: slots } = await supabase
    .from("event_slots")
    .select("id, event_date, region, apply_deadline")
    .eq("status", "OPEN")
    .gt("apply_deadline", new Date().toISOString())
    .in("event_date", dates)
    .in("region", regions);
  if (!slots || slots.length === 0)
    return { error: "고른 날짜·지역에 신청할 수 있는 회차가 없어요. 다른 조합을 골라 주세요.", ...keep };

  const admin = createAdminClient();
  const { data: app, error } = await admin
    .from("applications")
    .insert({ profile_id: profile.id, application_status: "SUBMITTED", payment_status: "PENDING", match_status: "WAITING" })
    .select("id")
    .single();
  if (error || !app) return { error: "신청서를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.", ...keep };

  const { error: slotError } = await admin
    .from("application_slots")
    .insert(slots.map((s) => ({ application_id: app.id, slot_id: s.id })));
  if (slotError) {
    await admin.from("applications").delete().eq("id", app.id);
    return { error: "신청서를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.", ...keep };
  }

  const deadline = slots.map((s) => s.apply_deadline).sort()[0];
  await logStatus(admin, {
    entity: "application", entityId: app.id, field: "application_status",
    from: null, to: "SUBMITTED", actor: "PARTICIPANT", actorProfileId: profile.id,
    reason: `회차 후보 ${slots.length}개`,
  });
  await notify(admin, {
    profileId: profile.id,
    key: "APPLICATION_SUBMITTED",
    title: "신청이 접수됐어요",
    body: `${fmtDeadline(deadline)}까지 결제하면 매칭 대상이 돼요. 신청 내용은 홈에서 확인하고, 마감 전까지 취소할 수 있어요.`,
    link: `/apply/${app.id}/pay`,
  });

  redirect(`/apply/${app.id}/pay`);
}
