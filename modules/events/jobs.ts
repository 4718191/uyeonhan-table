import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { mapLink } from "@/lib/map";
import { addDays, fmtEventDate, fmtTime, nowTimeKST, todayKST } from "@/lib/time";
import { contentText, tableContent } from "@/modules/content/topics";
import { tablesOnDates, upcomingEventDates, type EventTable } from "./tables";

// 행사 1일 전 리마인드(INF-07)와 행사 시작 시각 대화 콘텐츠 게시(CON-03).
// 같은 단체방에는 한 번만 올라간다(이미 같은 종류의 메시지가 있으면 건너뜀) → 여러 번 실행해도 중복 없음.

export type EventJobResult = { ok: boolean; message: string };
type Kind = "REMINDER" | "CONTENT";

async function pending(db: ReturnType<typeof createAdminClient>, tables: EventTable[], kind: Kind) {
  const rooms = tables.map((t) => t.roomId).filter(Boolean) as string[];
  if (!rooms.length) return [];
  const { data } = await db.from("chat_messages").select("room_id").eq("kind", kind).in("room_id", rooms);
  const done = new Set((data ?? []).map((r) => r.room_id as string));
  return tables.filter((t) => t.roomId && !done.has(t.roomId));
}

const label = (t: EventTable) => `${fmtEventDate(t.slot.event_date)} ${fmtTime(t.slot.start_time)} ${REGIONS[t.slot.region as RegionCode]}`;

export function reminderText(t: EventTable) {
  const v = t.venue;
  const map = v ? mapLink(v) : null;
  return [
    `내일 만나요! ${label(t)} · ${v?.name ?? "식당 확인 중"}`,
    v?.address ? `${v.address}${map ? ` (지도: ${map})` : ""}` : "",
    `예약명: 우연한 식탁 ${t.no}번 테이블 · ${t.members.length}명`,
    "",
    "취소 정책: 지금 취소하면 환불되지 않아요. 당일 취소와 노쇼는 이용 제한 대상이고, 행사 당일에는 단체방을 나갈 수 없어요.",
  ].filter((l, i) => l !== "" || i === 3).join("\n");
}

async function post(kind: Kind, trigger: "CRON" | "ADMIN"): Promise<EventJobResult> {
  const db = createAdminClient();
  const today = todayKST();
  const what = kind === "REMINDER" ? "리마인드" : "대화 콘텐츠";
  // CRON: 리마인드는 내일 행사, 콘텐츠는 오늘 행사. ADMIN(시연): 아직 안 보낸 가장 가까운 행사 날짜.
  const dates = trigger === "CRON" ? [kind === "REMINDER" ? addDays(today, 1) : today] : await upcomingEventDates(db, today);
  let date: string | null = null;
  let targets: EventTable[] = [];
  for (const d of dates) {
    targets = await pending(db, await tablesOnDates(db, [d]), kind);
    // CON-03: 실제 실행에서는 회차 시작 시각이 지난 테이블에만 대화 콘텐츠를 올린다
    if (trigger === "CRON" && kind === "CONTENT") targets = targets.filter((t) => t.slot.start_time <= nowTimeKST());
    if (targets.length) { date = d; break; }
  }
  if (!date) return { ok: true, message: `${what}를 보낼 테이블이 없어요. (대상 행사에는 이미 모두 보냈어요)` };

  const now = new Date().toISOString();
  const messages = targets.map((t) => ({
    room_id: t.roomId!, kind, delivery_status: "SENT",
    body: kind === "REMINDER" ? reminderText(t) : contentText(tableContent(t.members, t.no ?? 0)),
  }));
  const { error } = await db.from("chat_messages").insert(messages);
  if (error) {
    // 다른 경로에서 먼저 올린 방이 있으면(유일 키 충돌) 한 방씩 다시 넣고 이미 있는 방은 건너뛴다
    if (error.code !== "23505") return { ok: false, message: `${what} 게시 실패: ${error.message}` };
    for (const m of messages) await db.from("chat_messages").insert(m);
  }

  const notes = targets.flatMap((t) => t.members.map((m) => kind === "REMINDER"
    ? { profile_id: m.profileId, template_key: "EVENT_REMINDER", title: "내일 우연한 식탁에서 만나요", body: `${label(t)} · ${t.venue?.name ?? ""} · 예약명 우연한 식탁 ${t.no}번 테이블`, link: "/chat", sent_at: now, delivery_status: "SENT" }
    : { profile_id: m.profileId, template_key: "EVENT_CONTENT", title: "오늘의 대화 주제가 올라왔어요", body: "단체방에서 대화 주제와 아이스브레이킹 게임을 확인해 보세요.", link: "/chat", sent_at: now, delivery_status: "SENT" }));
  for (let i = 0; i < notes.length; i += 300) await db.from("notifications").insert(notes.slice(i, i + 300));

  const people = targets.reduce((s, t) => s + t.members.length, 0);
  return { ok: true, message: `${fmtEventDate(date)} 행사 ${targets.length}개 테이블(${people}명)에 ${what}를 보냈어요.` };
}

export const runRemind = (trigger: "CRON" | "ADMIN") => post("REMINDER", trigger);
export const runPostContent = (trigger: "CRON" | "ADMIN") => post("CONTENT", trigger);

/**
 * CON-03 보완: 회차 시작 시각이 지났는데 아직 대화 콘텐츠가 없는 단체방이면 바로 올린다.
 * 매일 한 번 도는 예약 작업(19:30)이 회차 시작 시각과 어긋날 때를 메운다. 참가자가 단체방·확정 상세를 열 때 호출한다.
 * 단체방마다 한 번만 올라가도록 DB 유일 키(0003)가 막는다.
 */
export async function ensureContentPosted(roomId: string, slot: { event_date: string; start_time: string }, members: { interests: string[]; selfTraits: string[] }[], tableNo: number | null) {
  if (slot.event_date !== todayKST() || slot.start_time > nowTimeKST()) return;
  const db = createAdminClient();
  const { data } = await db.from("chat_messages").select("id").eq("room_id", roomId).eq("kind", "CONTENT").limit(1);
  if (data?.length) return;
  await db.from("chat_messages").insert({ room_id: roomId, kind: "CONTENT", delivery_status: "SENT", body: contentText(tableContent(members, tableNo ?? 0)) });
}
