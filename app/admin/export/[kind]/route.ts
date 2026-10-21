import { requireAdmin } from "@/lib/auth";
import { loadApplicants, toCsv } from "@/lib/admin-data";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { fmtEventDate, todayKST } from "@/lib/time";

// CSV 내보내기 (PRD 16장): 참가자 목록, 테이블 결과
export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { supabase } = await requireAdmin();
  const { kind } = await params;
  let csv = "";
  if (kind === "applicants") {
    const rows = await loadApplicants(supabase);
    csv = toCsv(
      ["신청ID", "이름", "연락처", "출생연도", "성별", "신청 시각", "희망 날짜", "희망 지역", "확정 회차", "이용권", "신청 상태", "결제 상태", "결제 금액", "환불 금액", "매칭 상태", "참석 상태", "배치 사유", "이전 참석", "노쇼", "신고받음", "이용 제한"],
      rows.map((r) => [r.id, r.name, r.phone, r.birthYear, r.gender, r.created, r.dates, r.regions, r.confirmed, r.pass, r.application, r.payment, r.amount, r.refunded, r.match, r.attendance, r.reason, r.history.attended, r.history.noShow, r.history.reported, r.restriction]),
    );
  } else if (kind === "tables") {
    const { data } = await supabase.from("dining_tables")
      .select("id, table_no, size, total_score, status, confirmed_at, event_slots(event_date, start_time, region), venue_availability(venues(name)), table_members(active, applications(profiles(name)))")
      .order("created_at");
    const one = <T,>(x: unknown): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null)) as T | null;
    csv = toCsv(
      ["테이블ID", "행사일", "시작", "지역", "번호", "인원", "총점", "상태", "식당", "확정 시각", "참가자"],
      (data ?? []).map((t) => {
        const s = one<{ event_date: string; start_time: string; region: string }>(t.event_slots);
        const v = one<{ name: string }>(one<{ venues: unknown }>(t.venue_availability)?.venues);
        const names = ((t.table_members as { active: boolean; applications: unknown }[]) ?? []).filter((m) => m.active)
          .map((m) => one<{ name: string }>(one<{ profiles: unknown }>(m.applications)?.profiles)?.name).filter(Boolean).join(" / ");
        return [t.id, s ? fmtEventDate(s.event_date) : "", s?.start_time?.slice(0, 5) ?? "", s ? REGIONS[s.region as RegionCode] : "", t.table_no, t.size, t.total_score, t.status, v?.name ?? "", t.confirmed_at ?? "", names];
      }),
    );
  } else {
    return new Response("unknown", { status: 404 });
  }
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="uyeonhan-${kind}-${todayKST()}.csv"` },
  });
}
