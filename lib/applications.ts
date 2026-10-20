import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayKST } from "@/lib/time";

// 신청 조회 공통 (참가자 홈·결제·취소에서 함께 쓴다)

export const ACTIVE_MATCH = ["WAITING", "MATCHING", "REALLOCATING", "TRANSFERRED"] as const;

export type SlotInfo = {
  id: string;
  event_date: string;
  start_time: string;
  region: string;
  apply_deadline: string;
  status: string;
};

export type ApplicationView = {
  id: string;
  profile_id: string;
  application_status: string;
  payment_status: string;
  match_status: string;
  attendance_status: string | null;
  placement_reason: string | null;
  confirmed_slot_id: string | null;
  created_at: string;
  pass: { id: string; type: string; price: number; valid_until: string | null; extension_weeks: number } | null;
  payment: { amount: number; status: string; refunded_amount: number | null } | null;
  slots: SlotInfo[];
};

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

const SELECT = `id, profile_id, application_status, payment_status, match_status, attendance_status, placement_reason, confirmed_slot_id, created_at,
  passes(id, type, price, valid_until, extension_weeks),
  payments(amount, status, refunded_amount),
  application_slots(event_slots(id, event_date, start_time, region, apply_deadline, status))`;

type Row = Record<string, unknown> & {
  passes: unknown;
  payments: unknown;
  application_slots: { event_slots: unknown }[] | null;
};

function toView(row: Row): ApplicationView {
  const slots = (row.application_slots ?? [])
    .map((s) => one(s.event_slots as SlotInfo | SlotInfo[] | null))
    .filter((s): s is SlotInfo => !!s)
    .sort((a, b) => (a.event_date + a.region).localeCompare(b.event_date + b.region));
  return {
    ...(row as unknown as ApplicationView),
    pass: one(row.passes as ApplicationView["pass"]),
    payment: one(row.payments as ApplicationView["payment"]),
    slots,
  };
}

export async function getLatestApplication(db: SupabaseClient, profileId: string) {
  const { data } = await db
    .from("applications")
    .select(SELECT)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toView(data as Row) : null;
}

export async function getApplication(db: SupabaseClient, id: string) {
  const { data } = await db.from("applications").select(SELECT).eq("id", id).maybeSingle();
  return data ? toView(data as Row) : null;
}

/** 아직 끝나지 않은 신청 (결제 대기 또는 매칭 진행 중) */
export function isOngoing(app: ApplicationView | null) {
  return !!app && app.application_status === "SUBMITTED" && (ACTIVE_MATCH as readonly string[]).includes(app.match_status);
}

/** 단체방을 쓸 수 있는지: 확정된 신청 (당일 취소자는 행사 당일 단체방을 나갈 수 없어 그대로 둔다) */
export function hasChat(app: ApplicationView | null) {
  if (!app || app.match_status !== "CONFIRMED") return false;
  if (app.application_status === "SUBMITTED") return true;
  return app.slots.some((s) => s.id === app.confirmed_slot_id && s.event_date === todayKST());
}

/** 다음 마감 시각: 아직 지나지 않은 후보 회차 마감 중 가장 이른 것 */
export function nextDeadline(app: ApplicationView) {
  const now = Date.now();
  // 이미 매칭을 마친 회차(일정 이동 전 회차 등)는 빼고, 아직 열려 있는 회차만 본다
  const future = app.slots.filter((s) => s.status === "OPEN").map((s) => s.apply_deadline).filter((d) => new Date(d).getTime() > now).sort();
  return future[0] ?? null;
}

/** 멤버십 실제 만료일 = 기본 만료일 + 매칭 실패로 늘어난 주 수 */
export function membershipEnd(pass: { valid_until: string | null; extension_weeks: number }) {
  if (!pass.valid_until) return null;
  return addDays(pass.valid_until, pass.extension_weeks * 7);
}

/** 지금 쓸 수 있는 멤버십 (만료일이 오늘 이후) */
export async function getActiveMembership(db: SupabaseClient, profileId: string) {
  const { data } = await db
    .from("passes")
    .select("id, type, price, valid_until, extension_weeks")
    .eq("profile_id", profileId)
    .neq("type", "SINGLE")
    .order("valid_until", { ascending: false });
  const today = todayKST();
  return (data ?? []).find((p) => {
    const end = membershipEnd(p);
    return end !== null && end >= today;
  }) ?? null;
}

/** 매칭 실패 때 보관해 둔 1회권 (다음 신청 결제에 쓴다) */
export async function getStoredSingle(db: SupabaseClient, profileId: string) {
  const { data } = await db
    .from("passes")
    .select("id, type, price")
    .eq("profile_id", profileId)
    .eq("type", "SINGLE")
    .eq("stored", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data;
}
