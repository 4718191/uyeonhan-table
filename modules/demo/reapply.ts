import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fmtEventDate } from "@/lib/time";

// 시연 도구: 재참여 시뮬레이션 (PRD 18장 완료 조건 11 "다음 매칭에서 이전 만남과 피드백이 반영된 것을 확인")
// 가상 참가자는 스스로 다시 신청하지 않으므로, 가장 최근에 끝난 행사의 확정자(취소·노쇼 제외)를
// 다음 모집 회차의 같은 지역에 다시 신청·모의 결제시킨다. 그다음 "지금 매칭 실행"을 누르면
// 이전에 같은 테이블이었던 쌍, 차단·신고·"만나고 싶지 않아요" 쌍, 서로 "또 만나고 싶어요" 쌍이 반영된 결과를 모니터에서 볼 수 있다.
export async function simulateReapply() {
  const db = createAdminClient();
  const { data: closed } = await db.from("event_slots").select("id, event_date").in("status", ["CLOSED", "MATCHED"]).order("event_date", { ascending: false }).limit(20);
  if (!closed?.length) return { ok: false, message: "매칭이 끝난 행사가 없어요. 먼저 매칭을 실행해 주세요." };
  const lastDate = closed[0].event_date as string;
  const lastSlots = closed.filter((s) => s.event_date === lastDate).map((s) => s.id as string);

  const { data: open } = await db.from("event_slots").select("id, event_date, region, apply_deadline").eq("status", "OPEN").gt("event_date", lastDate).order("event_date");
  const nextDate = open?.[0]?.event_date as string | undefined;
  if (!nextDate) return { ok: false, message: "다시 신청할 모집 중인 회차가 없어요. 회차 관리에서 다음 회차를 만들어 주세요." };
  const nextSlotByRegion = new Map(open!.filter((s) => s.event_date === nextDate).map((s) => [s.region as string, s.id as string]));

  const { data: apps } = await db.from("applications").select("id, profile_id, attendance_status, confirmed_slot_id, passes(type), event_slots:confirmed_slot_id(region)")
    .in("confirmed_slot_id", lastSlots).eq("match_status", "CONFIRMED").in("attendance_status", ["SCHEDULED", "ATTENDED"]);
  // 이미 진행 중인 신청이 있는 사람은 빼고, 이용 제한 중인 사람도 뺀다 (매칭에서 어차피 제외)
  const pids = [...new Set((apps ?? []).map((a) => a.profile_id as string))];
  const { data: busy } = await db.from("applications").select("profile_id").in("profile_id", pids).eq("application_status", "SUBMITTED").in("match_status", ["WAITING", "REALLOCATING", "TRANSFERRED"]);
  const skip = new Set((busy ?? []).map((b) => b.profile_id as string));

  let made = 0;
  for (const a of apps ?? []) {
    if (skip.has(a.profile_id)) continue;
    const region = (Array.isArray(a.event_slots) ? a.event_slots[0] : a.event_slots as { region: string } | null)?.region;
    const slotId = region ? nextSlotByRegion.get(region) : undefined;
    if (!slotId) continue;
    const type = (Array.isArray(a.passes) ? a.passes[0] : a.passes as { type: string } | null)?.type ?? "SINGLE";
    const { data: pass } = await db.from("passes").insert({ profile_id: a.profile_id, type: type === "SINGLE" ? "SINGLE" : type, price: type === "SINGLE" ? 9900 : 0 }).select("id").single();
    const { data: app } = await db.from("applications").insert({ profile_id: a.profile_id, pass_id: pass?.id, application_status: "SUBMITTED", payment_status: "PAID", match_status: "WAITING" }).select("id").single();
    if (!app) continue;
    await db.from("application_slots").insert({ application_id: app.id, slot_id: slotId });
    await db.from("payments").insert({ application_id: app.id, amount: type === "SINGLE" ? 9900 : 0, status: "PAID", idempotency_key: `demo-reapply-${app.id}` });
    skip.add(a.profile_id);
    made++;
  }
  return { ok: true, message: `${fmtEventDate(lastDate)} 행사 확정자 ${made}명이 ${fmtEventDate(nextDate)} 같은 지역 회차에 다시 신청했어요(시연). 이제 "지금 매칭 실행"을 누르면 이전 만남·피드백 반영 결과를 모니터에서 볼 수 있어요.` };
}
