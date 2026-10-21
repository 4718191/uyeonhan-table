import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { fmtEventDate } from "@/lib/time";
import { Badge, Panel, tableCls } from "@/components/admin";
import { JobButtons } from "./JobButtons";

export const maxDuration = 60;

const one = <T,>(x: unknown): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null)) as T | null;
const head = { count: "exact" as const, head: true };

// A-1 운영 대시보드 (PRD 11장 "운영 대시보드에서 바로 보여야 하는 정보")
export default async function AdminPage() {
  const { supabase } = await requireAdmin();
  const [
    apps, { count: resolutionsPending }, { count: conflicts }, { count: venueShort }, { count: notiFailed }, { count: msgFailed },
    { count: deliveryEx }, { count: refundFailed }, { count: reportsOpen }, { count: exceptionsOpen }, { data: closedSlots }, { data: slots },
  ] = await Promise.all([
    (async () => {
      const out: { match_status: string; payment_status: string; application_status: string; attendance_status: string | null; reallocation_count: number; confirmed_slot_id: string | null; application_slots: unknown }[] = [];
      for (let f = 0; ; f += 1000) {
        const { data } = await supabase.from("applications").select("match_status, payment_status, application_status, attendance_status, reallocation_count, confirmed_slot_id, application_slots(event_slots(event_date))").range(f, f + 999);
        out.push(...((data ?? []) as typeof out));
        if (!data || data.length < 1000) break;
      }
      return out;
    })(),
    supabase.from("match_resolutions").select("*", head).eq("status", "PENDING"),
    supabase.from("exception_cases").select("*", head).in("type", ["CONDITION_CONFLICT", "DATA_MISSING"]).neq("status", "RESOLVED"),
    supabase.from("dining_tables").select("*", head).eq("status", "EXCEPTION"),
    supabase.from("notifications").select("*", head).eq("delivery_status", "FAILED"),
    supabase.from("chat_messages").select("*", head).eq("delivery_status", "FAILED"),
    supabase.from("exception_cases").select("*", head).eq("type", "DELIVERY_FAILED").neq("status", "RESOLVED"),
    supabase.from("applications").select("*", head).eq("payment_status", "REFUND_FAILED"),
    supabase.from("safety_reports").select("*", head).eq("status", "OPEN"),
    supabase.from("exception_cases").select("*", head).neq("status", "RESOLVED"),
    supabase.from("event_slots").select("id").eq("status", "CLOSED"),
    supabase.from("event_slots").select("id, event_date, status").order("event_date"),
  ]);
  const { data: runs } = await supabase.from("match_runs").select("slot_ids, candidate_count, confirmed_count, reallocated_count, failed_count");

  // 신청 완료 이상(이후 취소한 신청 포함)과 그중 결제를 마친 신청
  const submitted = apps.filter((a) => a.application_status !== "DRAFT");
  const paid = submitted.filter((a) => a.payment_status !== "PENDING" && a.payment_status !== "FAILED");
  const decided = apps.filter((a) => ["CONFIRMED", "ALTERNATIVE_OFFERED", "NO_MATCH", "EXCEPTION"].includes(a.match_status));
  const confirmed = apps.filter((a) => a.match_status === "CONFIRMED");
  const reallocatedConfirmed = confirmed.filter((a) => a.reallocation_count > 0).length;
  const closed = new Set((closedSlots ?? []).map((s) => s.id));
  const noShowCandidates = apps.filter((a) => a.attendance_status === "SCHEDULED" && a.application_status === "SUBMITTED" && closed.has(a.confirmed_slot_id ?? "")).length;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");

  const tiles: { label: string; value: string; sub?: string; href?: string; alert?: boolean }[] = [
    { label: "전체 신청 · 결제 완료", value: `${submitted.length} · ${paid.length}건`, sub: `취소 ${submitted.filter((a) => a.application_status === "CANCELED").length}건 포함`, href: "/admin/applicants" },
    { label: "자동 확정 성공률", value: pct(confirmed.length, decided.length), sub: `확정 ${confirmed.length}명 / 매칭 결과 ${decided.length}명`, href: "/admin/monitor" },
    { label: "재배치 후 확정", value: `${reallocatedConfirmed}명`, sub: `재배치 중 ${apps.filter((a) => a.match_status === "REALLOCATING").length}명`, href: "/admin/monitor" },
    { label: "대체 일정·환불 선택 대기", value: `${resolutionsPending ?? 0}명`, href: "/admin/applicants?match=실패" },
    { label: "자동 해결 안 된 조건 충돌", value: `${conflicts ?? 0}건`, href: "/admin/exceptions", alert: !!conflicts },
    { label: "식당 배정 안 된 테이블", value: `${venueShort ?? 0}개`, href: "/admin/exceptions", alert: !!venueShort },
    { label: "안내·리마인드 발송 실패", value: `${(notiFailed ?? 0) + (msgFailed ?? 0) + (deliveryEx ?? 0)}건`, href: "/admin/messages", alert: !!((notiFailed ?? 0) + (msgFailed ?? 0) + (deliveryEx ?? 0)) },
    { label: "자동 환불 실패", value: `${refundFailed ?? 0}건`, href: "/admin/applicants?pay=환불실패", alert: !!refundFailed },
    { label: "노쇼 후보", value: `${noShowCandidates}명`, href: "/admin/attendance", alert: noShowCandidates > 0 },
    { label: "미처리 신고", value: `${reportsOpen ?? 0}건`, href: "/admin/safety", alert: !!reportsOpen },
  ];

  // 회차(행사일)별 신청·결제·확정·참석 현황
  const dates = [...new Set((slots ?? []).map((s) => s.event_date))];
  const statusOf = (d: string) => {
    const ss = (slots ?? []).filter((s) => s.event_date === d).map((s) => s.status);
    return ss.includes("OPEN") ? "모집 중" : ss.includes("MATCHED") ? "확정·진행 예정" : ss.every((x) => x === "CLOSED") ? "종료" : "매칭 중";
  };
  const perDate = dates.map((d) => {
    const mine = apps.filter((a) => ((a.application_slots as { event_slots: unknown }[]) ?? []).some((x) => one<{ event_date: string }>(x.event_slots)?.event_date === d));
    const conf = apps.filter((a) => a.match_status === "CONFIRMED" && (slots ?? []).some((s) => s.id === a.confirmed_slot_id && s.event_date === d));
    // 이 날짜를 대상으로 한 자동 매칭 실행 결과
    const ids = new Set((slots ?? []).filter((s) => s.event_date === d).map((s) => s.id));
    const run = (runs ?? []).find((r) => ((r.slot_ids as string[]) ?? []).some((id) => ids.has(id)));
    return {
      d, status: statusOf(d), applied: mine.length, run,
      paid: mine.filter((a) => a.payment_status !== "PENDING").length,
      confirmed: conf.length, attended: conf.filter((a) => a.attendance_status === "ATTENDED").length,
    };
  });

  return (
    <>
      <h1 className="text-2xl font-bold">운영 대시보드</h1>
      <p className="text-sm text-stone-600">정상 흐름은 자동으로 진행돼요. 테두리가 굵은 칸만 운영자가 확인할 일이에요. (처리할 예외 {exceptionsOpen ?? 0}건)</p>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href ?? "#"} className={`flex flex-col gap-0.5 rounded-xl bg-white p-4 hover:bg-stone-50 ${t.alert ? "border-[2.5px] border-stone-900" : "border-[1.5px] border-stone-400"}`}>
            <span className="text-xs text-stone-600">{t.label}</span>
            <span className="text-xl font-bold">{t.value}</span>
            {t.sub && <span className="text-xs text-stone-600">{t.sub}</span>}
          </Link>
        ))}
      </section>

      <Panel title="회차별 현황">
        <table className={tableCls}>
          <thead><tr><th>행사일</th><th>상태</th><th>신청</th><th>결제 완료</th><th>매칭 후보</th><th>자동 확정</th><th>다른 날짜로 재배치</th><th>매칭 실패</th><th>체크인</th></tr></thead>
          <tbody>
            {perDate.map((r) => (
              <tr key={r.d}>
                <td className="whitespace-nowrap font-semibold">{fmtEventDate(r.d)}</td>
                <td><Badge tone={r.status === "모집 중" ? "line" : r.status === "종료" ? "muted" : "solid"}>{r.status}</Badge></td>
                <td>{r.applied}명</td><td>{r.paid}명</td>
                <td>{r.run ? `${r.run.candidate_count ?? 0}명` : "-"}</td>
                <td>{r.confirmed}명</td>
                <td>{r.run ? `${r.run.reallocated_count ?? 0}명` : "-"}</td>
                <td>{r.run ? `${r.run.failed_count ?? 0}명` : "-"}</td>
                <td>{r.attended}명</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-stone-600">한 신청이 여러 날짜를 고를 수 있어 날짜별 신청 수의 합은 전체 신청자보다 많을 수 있어요.</p>
      </Panel>

      <Panel title="시연 도구">
        <p className="text-sm text-stone-600">실제 운영에서 예약 실행되는 작업을 지금 바로 실행해요.</p>
        <JobButtons />
      </Panel>
    </>
  );
}
