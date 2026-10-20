import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logStatus } from "@/lib/history";
import { fmtEventDate, todayKST } from "@/lib/time";

// 행사 종료 처리 (FDB-01, PRD 15장)
// - 체크인한 사람(ATTENDED)에게 피드백 요청 알림을 보낸다.
// - 끝날 때까지 체크인하지 않은 확정자는 노쇼 후보가 된다(참석 상태 SCHEDULED로 남고, 회차가 CLOSED). 운영자는 후보만 확인해 NO_SHOW로 확정한다.
// - 회차를 MATCHED → CLOSED로 바꾼 실행만 처리하므로 여러 번 실행돼도 중복 알림이 없다.
export async function runCloseEvent(trigger: "CRON" | "ADMIN") {
  const db = createAdminClient();
  let q = db.from("event_slots").select("id, event_date").eq("status", "MATCHED").order("event_date").limit(40);
  q = trigger === "CRON" ? q.lte("event_date", todayKST()) : q;
  const { data: matched } = await q;
  if (!matched?.length) return { ok: true, message: "종료 처리할 행사가 없어요." };
  const date = matched[0].event_date as string;
  const ids = matched.filter((s) => s.event_date === date).map((s) => s.id as string);

  const { data: closed } = await db.from("event_slots").update({ status: "CLOSED" }).in("id", ids).eq("status", "MATCHED").select("id");
  if (!closed?.length) return { ok: true, message: `${fmtEventDate(date)} 행사는 이미 종료 처리했어요.` };
  const slotIds = closed.map((s) => s.id as string);

  const { data: apps } = await db.from("applications").select("id, profile_id, attendance_status")
    .in("confirmed_slot_id", slotIds).eq("match_status", "CONFIRMED").eq("application_status", "SUBMITTED");
  const attended = (apps ?? []).filter((a) => a.attendance_status === "ATTENDED");
  const noShow = (apps ?? []).filter((a) => a.attendance_status === "SCHEDULED");

  const now = new Date().toISOString();
  const notes = attended.map((a) => ({ profile_id: a.profile_id, template_key: "FEEDBACK_REQUEST", title: "오늘 모임은 어땠나요?",
    body: "분위기·대화·식당 평가와 다시 만나고 싶은 사람을 남겨 주세요. 다음 매칭에 반영되고, 상대에게는 공개되지 않아요.", link: "/feedback", sent_at: now, delivery_status: "SENT" }));
  for (let i = 0; i < notes.length; i += 300) await db.from("notifications").insert(notes.slice(i, i + 300));
  await logStatus(db, [
    ...slotIds.map((id) => ({ entity: "event_slot" as const, entityId: id, field: "status", from: "MATCHED", to: "CLOSED", actor: "SYSTEM" as const, reason: trigger === "CRON" ? "행사 종료" : "행사 종료 (운영자 시연 실행)" })),
    ...noShow.map((a) => ({ entity: "application" as const, entityId: a.id, field: "attendance_status", from: "SCHEDULED", to: "SCHEDULED", actor: "SYSTEM" as const, reason: "노쇼 후보: 행사 종료까지 체크인 없음 (운영자 확인 필요)" })),
  ]);

  return { ok: true, message: `${fmtEventDate(date)} 행사 종료: 체크인 ${attended.length}명에게 피드백 요청, 체크인 없는 ${noShow.length}명은 노쇼 후보로 표시했어요.` };
}
