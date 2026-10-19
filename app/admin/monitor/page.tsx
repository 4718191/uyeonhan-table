import { requireAdmin } from "@/lib/auth";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { MATCH_LABELS } from "@/lib/labels";
import { fmtDateTime, fmtDeadline, fmtEventDate, fmtTime } from "@/lib/time";
import { Badge, Panel, tableCls } from "@/components/admin";
import { RunControls } from "./RunControls";

export const maxDuration = 60;

const one = <T,>(x: unknown): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null)) as T | null;

type Run = {
  id: string; match_at: string; started_at: string; finished_at: string | null; triggered_by: string;
  candidate_count: number | null; created_count: number | null; split_merge_count: number | null;
  reallocated_count: number | null; confirmed_count: number | null; failed_count: number | null;
  failure_summary: { reasons?: Record<string, number>; unpaid?: number; venueShortage?: number; dataMissing?: number; error?: string } | null;
};

// A-5 자동 매칭·재배치·확정 모니터
export default async function MonitorPage() {
  const { supabase } = await requireAdmin();
  const [{ data: runs }, { data: nextSlots }, { data: issues }] = await Promise.all([
    supabase.from("match_runs").select("*").order("started_at", { ascending: false }).limit(10),
    supabase.from("event_slots").select("id, event_date, start_time, region, match_at").eq("status", "OPEN").order("match_at").limit(8),
    supabase.from("applications")
      .select("id, match_status, placement_reason, reallocation_count, updated_at, profiles(name)")
      .eq("application_status", "SUBMITTED").in("match_status", ["REALLOCATING", "NO_MATCH", "EXCEPTION"])
      .order("updated_at", { ascending: false }).limit(300),
  ]);
  const latest = (runs?.[0] ?? null) as Run | null;
  const nextAt = nextSlots?.[0]?.match_at;
  const nextBatch = (nextSlots ?? []).filter((s) => s.match_at === nextAt);

  const { data: tables } = latest
    ? await supabase.from("dining_tables")
        .select("id, table_no, size, total_score, status, scores, slot_id, event_slots(event_date, start_time, region), venue_availability(venues(name)), table_members(applications(profiles(name)))")
        .eq("match_run_id", latest.id).order("table_no")
    : { data: [] };
  const bySlot = new Map<string, typeof tables>();
  for (const t of tables ?? []) bySlot.set(t.slot_id, [...(bySlot.get(t.slot_id) ?? []), t]);

  return (
    <>
      <h1 className="text-2xl font-bold">자동 매칭 모니터</h1>

      <Panel title="다음 자동 매칭">
        {nextAt ? (
          <p className="text-sm">
            <b>{fmtDeadline(nextAt)}</b>에 자동 실행 예정 ·{" "}
            {nextBatch.map((s) => `${fmtEventDate(s.event_date)} ${fmtTime(s.start_time)} ${REGIONS[s.region as RegionCode]}`).join(", ")}
          </p>
        ) : <p className="text-sm text-stone-600">매칭을 기다리는 회차가 없어요.</p>}
        <p className="text-xs text-stone-600">
          실제 운영에서는 마감 시각에 자동으로 실행돼요. 시연할 때는 아래 버튼으로 다음 회차 매칭을 지금 실행할 수 있어요.
          같은 회차는 두 번 실행되지 않아요.
        </p>
        <RunControls canReset={!!latest} />
      </Panel>

      {latest && (
        <Panel title="최근 실행 결과" aside={<span className="text-xs text-stone-600">{fmtDateTime(latest.started_at)} · {latest.triggered_by === "CRON" ? "자동(예약)" : "운영자 시연 실행"}</span>}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {[
              ["대상 마감", fmtDeadline(latest.match_at)],
              ["매칭 후보", `${latest.candidate_count ?? 0}명`],
              ["확정 테이블", `${latest.created_count ?? 0}개`],
              ["확정 인원", `${latest.confirmed_count ?? 0}명`],
              ["다른 날짜로 재배치", `${latest.reallocated_count ?? 0}명`],
              ["매칭 실패", `${latest.failed_count ?? 0}명`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-stone-300 p-3">
                <p className="text-xs text-stone-600">{k}</p>
                <p className="text-lg font-bold">{v}</p>
              </div>
            ))}
          </div>
          {latest.failure_summary && (
            <p className="text-sm text-stone-700">
              {latest.failure_summary.error ? `오류: ${latest.failure_summary.error}` : [
                ...Object.entries(latest.failure_summary.reasons ?? {}).map(([k, v]) => `${k} ${v}명`),
                latest.failure_summary.unpaid ? `결제 미완료로 제외 ${latest.failure_summary.unpaid}명` : null,
                latest.failure_summary.venueShortage ? `식당 부족 ${latest.failure_summary.venueShortage}개 테이블` : null,
                latest.failure_summary.dataMissing ? `데이터 누락 ${latest.failure_summary.dataMissing}명` : null,
                latest.split_merge_count ? `다른 희망 지역으로 재배치해 만든 테이블 ${latest.split_merge_count}개` : null,
              ].filter(Boolean).join(" · ") || "남은 사람 없이 모두 확정됐어요."}
            </p>
          )}

          {[...bySlot.entries()].map(([slotId, list]) => {
            const slot = one<{ event_date: string; start_time: string; region: string }>(list?.[0]?.event_slots);
            return (
              <details key={slotId} className="rounded-lg border border-stone-300 p-3" open={bySlot.size <= 2}>
                <summary className="cursor-pointer text-sm font-semibold">
                  {slot && `${fmtEventDate(slot.event_date)} ${fmtTime(slot.start_time)} ${REGIONS[slot.region as RegionCode]}`} · 테이블 {list?.length}개 ·{" "}
                  {list?.reduce((s, t) => s + t.size, 0)}명
                </summary>
                <div className="mt-2 overflow-x-auto">
                  <table className={tableCls}>
                    <thead><tr><th>번호</th><th>인원</th><th>점수</th><th>구성</th><th>식당</th><th>상태</th><th>참가자</th></tr></thead>
                    <tbody>
                      {(list ?? []).map((t) => {
                        const venue = one<{ name: string }>(one<{ venues: unknown }>(t.venue_availability)?.venues);
                        const names = (t.table_members as { applications: unknown }[]).map((m) =>
                          one<{ name: string }>(one<{ profiles: unknown }>(m.applications)?.profiles)?.name).filter(Boolean);
                        const step = (t.scores as { step?: number } | null)?.step;
                        return (
                          <tr key={t.id}>
                            <td className="whitespace-nowrap font-semibold">{t.table_no}번</td>
                            <td>{t.size}명</td>
                            <td>{t.total_score}</td>
                            <td className="whitespace-nowrap">{step === 2 ? "다른 지역 재배치" : "희망 지역"}</td>
                            <td className="whitespace-nowrap">{venue?.name ?? "-"}</td>
                            <td><Badge tone={t.status === "CONFIRMED" ? "solid" : "line"}>{t.status === "CONFIRMED" ? "자동 확정" : "식당 확인 필요"}</Badge></td>
                            <td className="min-w-[200px] text-xs">{names.join(", ")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </Panel>
      )}

      <Panel title="재배치·실패·확인 필요" aside={<span className="text-xs text-stone-600">{issues?.length ?? 0}명</span>}>
        {!issues || issues.length === 0 ? <p className="text-sm text-stone-600">없어요.</p> : (
          <div className="max-h-[480px] overflow-auto">
            <table className={tableCls}>
              <thead><tr><th>참가자</th><th>상태</th><th>재배치 횟수</th><th>사유·다음 단계</th><th>변경 시각</th></tr></thead>
              <tbody>
                {issues.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap">{one<{ name: string }>(a.profiles)?.name}</td>
                    <td><Badge tone={a.match_status === "NO_MATCH" ? "solid" : "line"}>{MATCH_LABELS[a.match_status]}</Badge></td>
                    <td>{a.reallocation_count}</td>
                    <td className="text-xs">{a.placement_reason ?? "-"}</td>
                    <td className="whitespace-nowrap text-xs">{fmtDateTime(a.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-stone-600">
          재배치 중인 참가자는 신청한 다음 날짜 회차에서 자동으로 다시 매칭되고, 매칭 실패 참가자는 대체 일정·보관·환불 중에서 직접 골라요.
          운영자가 처리할 일은 예외 처리함에만 올라와요.
        </p>
      </Panel>
    </>
  );
}
