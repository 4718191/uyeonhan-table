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
  settings_snapshot: Record<string, number> | null;
  failure_summary: { restricted?: number; relations?: { blocked: number; met: number; wantAgain: number; metSeated: number; conflictsSeated: number }; reasons?: Record<string, number>; unpaid?: number; venueShortage?: number; dataMissing?: number; error?: string } | null;
};

// A-5 자동 매칭·재배치·확정 모니터
export default async function MonitorPage() {
  const { supabase } = await requireAdmin();
  const [{ data: runs }, { data: nextSlots }, { data: issues }] = await Promise.all([
    supabase.from("match_runs").select("*").order("started_at", { ascending: false }).limit(10),
    supabase.from("event_slots").select("id, event_date, start_time, region, match_at").eq("status", "OPEN").order("match_at").limit(8),
    supabase.from("applications")
      .select("id, match_status, placement_reason, reallocation_count, updated_at, profiles(name)")
      .eq("application_status", "SUBMITTED").in("match_status", ["REALLOCATING", "ALTERNATIVE_OFFERED", "TRANSFERRED", "NO_MATCH", "EXCEPTION"])
      .order("updated_at", { ascending: false }).limit(300),
  ]);
  const latest = (runs?.[0] ?? null) as Run | null;
  const nextAt = nextSlots?.[0]?.match_at;
  const nextBatch = (nextSlots ?? []).filter((s) => s.match_at === nextAt);

  const { data: tables } = latest
    ? await supabase.from("dining_tables")
        .select("id, table_no, size, total_score, status, scores, slot_id, confirmed_at, event_slots(event_date, start_time, region), venue_availability(venues(name)), table_members(active, applications(placement_reason, reallocation_count, profiles(name, birth_year, gender, mbti, interests, wanted_traits)))")
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
                latest.failure_summary.restricted ? `이용 제한으로 제외 ${latest.failure_summary.restricted}명` : null,
                latest.failure_summary.venueShortage ? `식당 부족 ${latest.failure_summary.venueShortage}개 테이블` : null,
                latest.failure_summary.dataMissing ? `데이터 누락 ${latest.failure_summary.dataMissing}명` : null,
                latest.split_merge_count ? `다른 희망 지역으로 재배치해 만든 테이블 ${latest.split_merge_count}개` : null,
              ].filter(Boolean).join(" · ") || "남은 사람 없이 모두 확정됐어요."}
            </p>
          )}

          {latest.failure_summary?.relations && (
            <div className="rounded-lg border border-stone-300 p-3 text-sm">
              <p className="font-semibold">이전 만남·피드백 반영 (이번 후보끼리)</p>
              <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5">
                <li>차단·신고·&quot;만나고 싶지 않아요&quot; 관계 <b>{latest.failure_summary.relations.blocked}쌍</b> → 같은 테이블 배정 제외 (확정 테이블 안 충돌 <b>{latest.failure_summary.relations.conflictsSeated}건</b>)</li>
                <li>이전에 같은 테이블이었던 <b>{latest.failure_summary.relations.met}쌍</b> → &quot;새로운 사람&quot; 점수 감점 (그래도 같은 테이블이 된 쌍 {latest.failure_summary.relations.metSeated}쌍)</li>
                <li>서로 &quot;또 만나고 싶어요&quot;를 고른 <b>{latest.failure_summary.relations.wantAgain}쌍</b> → 감점에서 제외</li>
              </ul>
            </div>
          )}

          {[...bySlot.entries()].map(([slotId, list]) => {
            const slot = one<{ event_date: string; start_time: string; region: string }>(list?.[0]?.event_slots);
            return (
              <details key={slotId} className="rounded-lg border border-stone-300 p-3" open={bySlot.size <= 2}>
                <summary className="cursor-pointer text-sm font-semibold">
                  {slot && `${fmtEventDate(slot.event_date)} ${fmtTime(slot.start_time)} ${REGIONS[slot.region as RegionCode]}`} · 테이블 {list?.length}개 ·{" "}
                  {list?.reduce((s, t) => s + t.size, 0)}명
                </summary>
                <div className="mt-2 flex flex-col gap-2">
                  {(list ?? []).map((t) => <TableDetail key={t.id} t={t as unknown as TableRow} weights={latest.settings_snapshot ?? {}} />)}
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
                    <td><Badge tone={a.match_status === "NO_MATCH" || a.match_status === "ALTERNATIVE_OFFERED" ? "solid" : "line"}>{MATCH_LABELS[a.match_status]}</Badge></td>
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
          재배치 중인 참가자는 신청한 다음 날짜 회차에서 자동으로 다시 매칭되고, 대체 일정 제안을 받은 참가자는 대체 일정·보관·환불(멤버십은 기한 연장) 중에서 직접 골라요. 매칭 실패는 이동할 일정이 없는 경우예요.
          운영자가 처리할 일은 예외 처리함에만 올라와요.
        </p>
      </Panel>
    </>
  );
}

type Member = { placement_reason: string | null; reallocation_count: number; profiles: unknown };
type Prof = { name: string; birth_year: number | null; gender: string | null; mbti: string | null; interests: string[] | null; wanted_traits: string[] | null };
type TableRow = {
  id: string; table_no: number | null; size: number; total_score: number | null; status: string; confirmed_at: string | null;
  scores: { age?: number; gender?: number; mbti?: number; interest?: number; wanted?: number; newPeople?: number; step?: number; ageGap?: number; metPairs?: number; conflicts?: number; verified?: boolean } | null;
  venue_availability: unknown; table_members: { active: boolean; applications: unknown }[];
};

const PARTS: [key: "age" | "gender" | "mbti" | "interest" | "wanted" | "newPeople", label: string, w: string][] = [
  ["age", "나이", "w_age"], ["gender", "성비", "w_gender"], ["mbti", "MBTI", "w_mbti"],
  ["interest", "관심사", "w_interest"], ["wanted", "만나고 싶은 조건", "w_wanted"], ["newPeople", "새로운 사람", "w_new_people"],
];

// 7.2 매칭 결과 표시: 테이블 하나를 펼치면 구성 근거(연령·성비·MBTI·관심사·조건 충족·이전 만남·충돌·점수·재배치·확정 시각)를 보여 준다
function TableDetail({ t, weights }: { t: TableRow; weights: Record<string, number> }) {
  const venue = one<{ name: string }>(one<{ venues: unknown }>(t.venue_availability)?.venues);
  const members = t.table_members.filter((m) => m.active).map((m) => {
    const a = one<Member>(m.applications);
    return a ? { ...a, p: one<Prof>(a.profiles) } : null;
  }).filter((m): m is Member & { p: Prof | null } => !!m);
  const years = members.map((m) => m.p?.birth_year).filter((y): y is number => !!y);
  const f = members.filter((m) => m.p?.gender === "F").length;
  const male = members.filter((m) => m.p?.gender === "M").length;
  const count = new Map<string, number>();
  members.forEach((m) => (m.p?.interests ?? []).forEach((i) => count.set(i, (count.get(i) ?? 0) + 1)));
  const common = [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  const sc = t.scores ?? {};
  const pairs = (t.size * (t.size - 1)) / 2;
  const metPairs = sc.metPairs ?? Math.round((1 - (sc.newPeople ?? 1)) * pairs);
  const pct = (x?: number) => (x == null ? "-" : `${Math.round(x * 100)}%`);

  const facts: [string, React.ReactNode][] = [
    ["날짜·지역", sc.step === 2 ? "같은 날짜, 다른 희망 지역으로 재배치" : "희망 날짜·희망 지역 그대로"],
    ["연령", years.length ? `최고령 ${Math.min(...years)}년생 · 최연소 ${Math.max(...years)}년생 · 차이 ${Math.max(...years) - Math.min(...years)}살 (기준 8살 이내)` : "-"],
    ["성비", `여 ${f} · 남 ${male}`],
    ["MBTI 구성", members.map((m) => m.p?.mbti ?? "미입력").join(", ")],
    ["공통 관심사", common.length ? common.map(([k, n]) => `${k} ${n}명`).join(", ") : "2명 이상 겹치는 관심사 없음"],
    ["만나고 싶은 조건 충족", pct(sc.wanted)],
    ["이전 만남", metPairs ? `이전에 같은 테이블이었던 쌍 ${metPairs}개 / ${pairs}쌍` : `없음 (${pairs}쌍 모두 처음)`],
    ["충돌 관계 확인", sc.conflicts ? `차단·신고·비선호 ${sc.conflicts}건` : `차단·신고·비선호 없음${sc.verified ? " · 확정 전 재검증 통과" : ""}`],
    ["확정 시각", t.confirmed_at ? fmtDateTime(t.confirmed_at) : "미확정"],
  ];

  return (
    <details className="rounded-lg border border-stone-300">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
        <b className="whitespace-nowrap">{t.table_no}번</b>
        <span>{t.size}명</span>
        <span className="whitespace-nowrap">{t.total_score}점</span>
        <span className="whitespace-nowrap">{venue?.name ?? "식당 미배정"}</span>
        <Badge tone={t.status === "CONFIRMED" ? "solid" : t.status === "DISSOLVED" ? "muted" : "line"}>{t.status === "CONFIRMED" ? "자동 확정" : t.status === "DISSOLVED" ? "취소로 해제" : "운영 확인 필요"}</Badge>
        <span className="text-xs text-stone-600">{members.map((m) => m.p?.name).filter(Boolean).join(", ")}</span>
      </summary>
      <div className="grid gap-4 border-t border-stone-300 p-3 lg:grid-cols-2">
        <dl className="grid grid-cols-[132px_1fr] gap-x-2 gap-y-1.5 text-sm">
          {facts.map(([k, v]) => (
            <div key={k} className="contents"><dt className="text-stone-600">{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
        <div className="flex flex-col gap-1.5 text-sm">
          <p className="font-semibold">조건별 점수 (총 {t.total_score}점)</p>
          {PARTS.map(([k, label, w]) => {
            const max = weights[w] ?? 0;
            const got = sc[k] == null ? null : Math.round(sc[k]! * max * 10) / 10;
            return (
              <div key={k} className="grid grid-cols-[120px_1fr_64px] items-center gap-2">
                <span className="text-stone-600">{label}</span>
                <span className="h-2 rounded-full bg-stone-200"><span className="block h-2 rounded-full bg-stone-900" style={{ width: `${(sc[k] ?? 0) * 100}%` }} /></span>
                <span className="text-right text-xs">{got ?? "-"} / {max}</span>
              </div>
            );
          })}
        </div>
        <div className="overflow-x-auto lg:col-span-2">
          <table className={tableCls}>
            <thead><tr><th>참가자</th><th>출생연도</th><th>성별</th><th>MBTI</th><th>재배치</th><th>최종 배치 사유</th></tr></thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap">{m.p?.name}</td>
                  <td>{m.p?.birth_year ?? "-"}</td>
                  <td>{m.p?.gender === "F" ? "여" : m.p?.gender === "M" ? "남" : "-"}</td>
                  <td>{m.p?.mbti ?? "-"}</td>
                  <td>{m.reallocation_count}회</td>
                  <td className="text-xs">{m.placement_reason ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
