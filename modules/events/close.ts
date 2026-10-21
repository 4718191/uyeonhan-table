import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { logStatus } from "@/lib/history";
import { deliver } from "@/lib/delivery";
import { fmtDeadline, fmtEventDate, fmtTime, todayKST } from "@/lib/time";

// 행사 종료 처리 (FDB-01, PRD 14·15장)
// 1) 회차를 MATCHED → CLOSED로 바꾸고,
//    - 체크인한 사람(ATTENDED)에게 만족도·안전 피드백 요청과 다음 모집 일정 추천 알림을 보낸다.
//    - 끝날 때까지 체크인하지 않은 확정자는 노쇼 후보가 된다(참석 상태 SCHEDULED + 회차 CLOSED). 운영자는 후보만 확인한다.
// 2) 이전에 종료한 행사에서 피드백을 아직 안 낸 참석자에게 리마인드를 1회만 보낸다 (다음 신청은 막지 않는다).
// 같은 알림은 링크(신청 ID)로 중복을 막아 여러 번 실행돼도 한 번만 간다.

type Db = ReturnType<typeof createAdminClient>;
type Note = { profile_id: string; template_key: string; title: string; body: string; link: string; sent_at: string; delivery_status: "SENT" };

export async function runCloseEvent(trigger: "CRON" | "ADMIN") {
  const db = createAdminClient();
  const now = new Date().toISOString();
  const today = todayKST();
  const parts: string[] = [];

  // ── 2) 피드백 미응답 리마인드 (이번 실행 전에 종료된 행사 대상) ──
  const reminded = await remindFeedback(db, trigger === "CRON" ? today : null, now);
  if (reminded) parts.push(`피드백 미응답 ${reminded}명에게 리마인드 1회`);

  // ── 1) 행사 종료 ──
  let q = db.from("event_slots").select("id, event_date").eq("status", "MATCHED").order("event_date").limit(40);
  if (trigger === "CRON") q = q.lte("event_date", today);
  const { data: matched } = await q;
  if (!matched?.length) return { ok: true, message: parts.length ? `${parts.join(", ")}. 종료 처리할 행사는 없어요.` : "종료 처리할 행사가 없어요." };
  const date = matched[0].event_date as string;
  const ids = matched.filter((s) => s.event_date === date).map((s) => s.id as string);

  const { data: closed } = await db.from("event_slots").update({ status: "CLOSED" }).in("id", ids).eq("status", "MATCHED").select("id, region");
  if (!closed?.length) return { ok: true, message: `${fmtEventDate(date)} 행사는 이미 종료 처리했어요.` };
  const slotIds = closed.map((s) => s.id as string);
  const regionOf = new Map(closed.map((s) => [s.id as string, s.region as string]));

  const { data: apps } = await db.from("applications").select("id, profile_id, attendance_status, confirmed_slot_id")
    .in("confirmed_slot_id", slotIds).eq("match_status", "CONFIRMED").eq("application_status", "SUBMITTED");
  const attended = (apps ?? []).filter((a) => a.attendance_status === "ATTENDED");
  const noShow = (apps ?? []).filter((a) => a.attendance_status === "SCHEDULED");

  // 다음 모집 일정 추천: 이번에 참석한 지역의 신청 가능한 회차부터 (RET-02, 14장 다음 모집 시작)
  const { data: open } = await db.from("event_slots").select("id, event_date, start_time, region, apply_deadline")
    .eq("status", "OPEN").gt("apply_deadline", now).order("event_date").limit(40);
  const recFor = (region: string) => [...(open ?? []).filter((s) => s.region === region), ...(open ?? []).filter((s) => s.region !== region)].slice(0, 3);

  const notes: Note[] = [];
  for (const a of attended) {
    notes.push({ profile_id: a.profile_id, template_key: "FEEDBACK_REQUEST", title: "오늘 모임은 어땠나요?",
      body: "분위기·대화·식당 평가와 다시 만나고 싶은 사람을 남겨 주세요. 불편한 일이 있었다면 같은 화면에서 신고할 수 있어요. 상대에게는 공개되지 않아요.",
      link: `/feedback?app=${a.id}`, sent_at: now, delivery_status: "SENT" });
    const recs = recFor(regionOf.get(a.confirmed_slot_id as string) ?? "");
    if (recs.length) notes.push({ profile_id: a.profile_id, template_key: "NEXT_EVENT", title: "다음 모임도 함께해요",
      body: `${recs.map((s) => `${fmtEventDate(s.event_date)} ${fmtTime(s.start_time)} ${REGIONS[s.region as RegionCode]}`).join(" / ")} · 가장 빠른 신청 마감 ${fmtDeadline(recs[0].apply_deadline)}`,
      link: "/history", sent_at: now, delivery_status: "SENT" });
  }
  await deliver(db, "notifications", notes, "행사 종료 알림");
  await logStatus(db, [
    ...slotIds.map((id) => ({ entity: "event_slot" as const, entityId: id, field: "status", from: "MATCHED", to: "CLOSED", actor: "SYSTEM" as const, reason: trigger === "CRON" ? "행사 종료" : "행사 종료 (운영자 시연 실행)" })),
    ...noShow.map((a) => ({ entity: "application" as const, entityId: a.id, field: "attendance_status", from: "SCHEDULED", to: "SCHEDULED", actor: "SYSTEM" as const, reason: "노쇼 후보: 행사 종료까지 체크인 없음 (운영자 확인 필요)" })),
  ]);

  parts.unshift(`${fmtEventDate(date)} 행사 종료: 체크인 ${attended.length}명에게 피드백 요청·다음 일정 추천, 체크인 없는 ${noShow.length}명은 노쇼 후보로 표시`);
  return { ok: true, message: `${parts.join(" · ")}.` };
}

/** 이전에 종료한 행사의 피드백 미제출 참석자에게 리마인드 1회. beforeDate가 있으면 그 날짜 전에 끝난 행사만 (CRON: 다음 날 이후) */
async function remindFeedback(db: Db, beforeDate: string | null, now: string) {
  let q = db.from("event_slots").select("id").eq("status", "CLOSED");
  if (beforeDate) q = q.lt("event_date", beforeDate);
  const { data: slots } = await q.limit(200);
  if (!slots?.length) return 0;
  const { data: apps } = await db.from("applications").select("id, profile_id")
    .in("confirmed_slot_id", slots.map((s) => s.id)).eq("attendance_status", "ATTENDED");
  if (!apps?.length) return 0;

  // 피드백을 이미 냈거나 리마인드를 이미 받은 사람은 뺀다
  const { data: tm } = await db.from("table_members").select("application_id, table_id").in("application_id", apps.map((a) => a.id));
  const tableOf = new Map((tm ?? []).map((m) => [m.application_id as string, m.table_id as string]));
  const { data: fbs } = await db.from("feedbacks").select("table_id, profile_id").in("profile_id", apps.map((a) => a.profile_id));
  const done = new Set((fbs ?? []).map((f) => `${f.profile_id}:${f.table_id}`));
  const links = apps.map((a) => `/feedback?app=${a.id}`);
  const { data: sent } = await db.from("notifications").select("link").eq("template_key", "FEEDBACK_REMINDER").in("link", links);
  const already = new Set((sent ?? []).map((n) => n.link as string));

  const targets = apps.filter((a) => !done.has(`${a.profile_id}:${tableOf.get(a.id)}`) && !already.has(`/feedback?app=${a.id}`));
  if (!targets.length) return 0;
  await deliver(db, "notifications", targets.map((a) => ({
    profile_id: a.profile_id, template_key: "FEEDBACK_REMINDER", title: "지난 모임 피드백을 기다리고 있어요",
    body: "1분이면 충분해요. 남겨 주신 평가와 선호는 다음 매칭에 반영되고, 상대에게는 공개되지 않아요. (안내는 이번 한 번만 보내요)",
    link: `/feedback?app=${a.id}`, sent_at: now,
  })), "피드백 리마인드");
  return targets.length;
}
