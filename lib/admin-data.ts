import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { MATCH_LABELS, PASS_LABELS, PAYMENT_LABELS } from "@/lib/labels";
import { restrictionText } from "@/lib/restrictions";
import { fmtDateTime, fmtEventDate } from "@/lib/time";

// 운영자 목록·CSV에서 함께 쓰는 신청자 데이터 (A-4)

const one = <T,>(x: unknown): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null)) as T | null;
export const ATTEND_LABELS: Record<string, string> = { SCHEDULED: "참석 예정", ATTENDED: "참석", CANCELED_EARLY: "사전 취소", CANCELED_LATE: "확정 후 취소", NO_SHOW: "노쇼" };
export const APP_LABELS: Record<string, string> = { DRAFT: "작성 중", SUBMITTED: "신청 완료", CANCELED: "취소" };

export type ApplicantRow = {
  id: string; name: string; phone: string; birthYear: number | null; gender: string; created: string;
  dates: string; regions: string; confirmed: string; pass: string;
  application: string; payment: string; amount: number; refunded: number | null; match: string; attendance: string; reason: string;
  history: { attended: number; noShow: number; reported: number }; restriction: string;
  raw: { payment: string; match: string; attendance: string | null; application: string; regions: string[]; dates: string[] };
};

export async function loadApplicants(db: SupabaseClient): Promise<ApplicantRow[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("applications")
      .select("id, profile_id, created_at, application_status, payment_status, match_status, attendance_status, placement_reason, confirmed_slot_id, profiles(name, phone, birth_year, gender, restriction_level, restricted_until), passes(type), payments(amount, refunded_amount), application_slots(event_slots(id, event_date, region))")
      .order("created_at", { ascending: false }).range(from, from + 999);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < 1000) break;
  }
  // 이전 참석·노쇼·신고 이력 (프로필 기준)
  const hist = new Map<string, { attended: number; noShow: number; reported: number }>();
  for (const r of rows) {
    const h = hist.get(r.profile_id as string) ?? { attended: 0, noShow: 0, reported: 0 };
    if (r.attendance_status === "ATTENDED") h.attended++;
    if (r.attendance_status === "NO_SHOW") h.noShow++;
    hist.set(r.profile_id as string, h);
  }
  const { data: reps } = await db.from("safety_reports").select("reported");
  (reps ?? []).forEach((r) => { const h = hist.get(r.reported); if (h) h.reported++; });

  return rows.map((r) => {
    const p = one<{ name: string; phone: string | null; birth_year: number | null; gender: string | null; restriction_level: number; restricted_until: string | null }>(r.profiles);
    const pay = one<{ amount: number; refunded_amount: number | null }>(r.payments);
    const slots = ((r.application_slots as { event_slots: unknown }[]) ?? []).map((x) => one<{ id: string; event_date: string; region: string }>(x.event_slots)).filter(Boolean) as { id: string; event_date: string; region: string }[];
    const conf = slots.find((s) => s.id === r.confirmed_slot_id);
    const dates = [...new Set(slots.map((s) => s.event_date))].sort();
    const regions = [...new Set(slots.map((s) => s.region))];
    return {
      id: r.id as string, name: p?.name ?? "", phone: p?.phone ?? "", birthYear: p?.birth_year ?? null, gender: p?.gender === "F" ? "여" : p?.gender === "M" ? "남" : "",
      created: fmtDateTime(r.created_at as string),
      dates: dates.map(fmtEventDate).join(", "), regions: regions.map((x) => REGIONS[x as RegionCode]).join(", "),
      confirmed: conf ? `${fmtEventDate(conf.event_date)} ${REGIONS[conf.region as RegionCode]}` : "",
      pass: PASS_LABELS[one<{ type: string }>(r.passes)?.type ?? ""] ?? "",
      application: APP_LABELS[r.application_status as string] ?? "", payment: PAYMENT_LABELS[r.payment_status as string] ?? "",
      amount: pay?.amount ?? 0, refunded: pay?.refunded_amount ?? null,
      // 마감 전 취소한 신청은 매칭 상태 대신 "신청 취소"로 보여 준다
      match: r.application_status === "CANCELED" && r.attendance_status !== "CANCELED_LATE" ? "신청 취소" : MATCH_LABELS[r.match_status as string] ?? "", attendance: ATTEND_LABELS[(r.attendance_status as string) ?? ""] ?? "",
      reason: (r.placement_reason as string) ?? "",
      history: hist.get(r.profile_id as string) ?? { attended: 0, noShow: 0, reported: 0 },
      restriction: p ? restrictionText(p) : "",
      raw: { payment: r.payment_status as string, match: r.match_status as string, attendance: (r.attendance_status as string) ?? null, application: r.application_status as string, regions, dates },
    };
  });
}

/** CSV (엑셀에서 한글이 깨지지 않게 BOM을 붙인다) */
export function toCsv(header: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}
