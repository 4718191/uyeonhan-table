import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logStatus } from "@/lib/history";
import { notify } from "@/lib/notify";
import { addDays, fmtEventDate, todayKST } from "@/lib/time";

// 이용 제한 (SAF-02, MVP 6장 운영 정책)
// 노쇼·당일 취소 누적 1회 경고, 2회 4주 참가 제한, 3회 이상 영구 제한. 시스템이 단계를 제안하고 운영자가 확정한다.
// profiles.restriction_level: 0 없음 · 1 경고 · 2 기간 제한(restricted_until까지) · 3 영구 제한

export type Action = "WARNING" | "SUSPEND" | "BAN";
export const ACTION_LABEL: Record<Action | "NONE", string> = { NONE: "조치 없음", WARNING: "경고", SUSPEND: "4주 참가 제한", BAN: "영구 제한" };
export const LEVEL_LABEL = ["없음", "경고", "기간 제한", "영구 제한"];
const LEVEL: Record<Action, number> = { WARNING: 1, SUSPEND: 2, BAN: 3 };
export const SUSPEND_DAYS = 28;

export function suggestAction(strikes: number): Action | null {
  return strikes >= 3 ? "BAN" : strikes === 2 ? "SUSPEND" : strikes === 1 ? "WARNING" : null;
}

/** 지금 신청·매칭이 막혔는지 (영구 제한, 또는 기간 제한 중) */
export function isRestricted(p: { restriction_level: number; restricted_until: string | null }) {
  if (p.restriction_level >= 3) return true;
  return p.restriction_level === 2 && !!p.restricted_until && p.restricted_until > new Date().toISOString();
}

export function restrictionText(p: { restriction_level: number; restricted_until: string | null }) {
  if (p.restriction_level >= 3) return "영구 제한";
  if (p.restriction_level === 2 && p.restricted_until) return isRestricted(p) ? `${fmtEventDate(p.restricted_until.slice(0, 10))}까지 참가 제한` : "기간 제한 종료";
  return LEVEL_LABEL[p.restriction_level] ?? "없음";
}

/** 프로필별 노쇼·당일 취소 누적 횟수 */
export async function countStrikes(db: SupabaseClient, profileIds: string[]) {
  const out = new Map<string, { noShow: number; sameDay: number }>();
  if (!profileIds.length) return out;
  const { data: apps } = await db.from("applications").select("id, profile_id, attendance_status").in("profile_id", profileIds).in("attendance_status", ["NO_SHOW", "CANCELED_LATE"]);
  const late = (apps ?? []).filter((a) => a.attendance_status === "CANCELED_LATE").map((a) => a.id as string);
  const { data: hist } = late.length
    ? await db.from("status_history").select("entity_id").eq("field", "attendance_status").eq("to_value", "CANCELED_LATE").like("reason", "당일 취소%").in("entity_id", late)
    : { data: [] };
  const sameDay = new Set((hist ?? []).map((h) => h.entity_id as string));
  for (const a of apps ?? []) {
    const c = out.get(a.profile_id) ?? { noShow: 0, sameDay: 0 };
    if (a.attendance_status === "NO_SHOW") c.noShow++;
    else if (sameDay.has(a.id)) c.sameDay++;
    out.set(a.profile_id, c);
  }
  return out;
}

/** 운영자가 제한을 확정한다. 이미 더 높은 단계면 낮추지 않는다. 신고자 정보는 알리지 않는다. */
export async function applyRestriction(db: SupabaseClient, profileId: string, action: Action, reason: string, adminProfileId: string | null) {
  const { data: p } = await db.from("profiles").select("restriction_level, restricted_until").eq("id", profileId).single();
  if (!p) return false;
  const level = Math.max(p.restriction_level ?? 0, LEVEL[action]);
  const until = action === "SUSPEND" ? `${addDays(todayKST(), SUSPEND_DAYS)}T15:00:00Z` : p.restricted_until; // 28일 뒤 24:00 KST
  await db.from("profiles").update({ restriction_level: level, restricted_until: until }).eq("id", profileId);
  await logStatus(db, { entity: "profile", entityId: profileId, field: "restriction_level", from: String(p.restriction_level ?? 0), to: String(level), actor: "ADMIN", actorProfileId: adminProfileId, reason: `${ACTION_LABEL[action]}: ${reason}` });
  await notify(db, {
    profileId, key: `RESTRICTION_${action}`,
    title: action === "WARNING" ? "이용 안내: 경고" : action === "SUSPEND" ? "참가가 4주 제한됐어요" : "서비스 이용이 제한됐어요",
    body: action === "WARNING"
      ? `${reason}. 한 번 더 발생하면 4주 동안 참가가 제한돼요.`
      : action === "SUSPEND"
        ? `${reason}. ${fmtEventDate(addDays(todayKST(), SUSPEND_DAYS))}까지 새 신청과 매칭에 참여할 수 없어요.`
        : `${reason}. 더 이상 모임에 신청할 수 없어요. 문의는 고객센터로 연락해 주세요.`,
    link: "/home",
  });
  return true;
}
