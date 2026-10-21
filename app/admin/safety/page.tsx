import { requireAdmin } from "@/lib/auth";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { ACTION_LABEL, restrictionText } from "@/lib/restrictions";
import { fmtDateTime, fmtEventDate } from "@/lib/time";
import { Badge, Panel, btnCls, inputCls, tableCls } from "@/components/admin";
import { reviewReport } from "./actions";

const one = <T,>(x: unknown): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null)) as T | null;
type P = { name: string; restriction_level: number; restricted_until: string | null };

// A-10 피드백·신고 관리 (PRD 11장 피드백·안전, FDB-02~04, SAF-01·02)
export default async function SafetyPage() {
  const { supabase } = await requireAdmin();
  const [{ data: reports }, { data: fbs }, { count: avoid }, { count: want }, { count: blocks }] = await Promise.all([
    supabase.from("safety_reports")
      .select("id, reason, status, action, created_at, reviewed_at, reporter_p:profiles!safety_reports_reporter_fkey(name, restriction_level, restricted_until), reported_p:profiles!safety_reports_reported_fkey(name, restriction_level, restricted_until), dining_tables(table_no, event_slots(event_date, region))")
      .order("created_at", { ascending: false }).limit(200),
    supabase.from("feedbacks").select("mood, conversation, venue, rejoin_intent, recommend_intent"),
    supabase.from("person_preferences").select("*", { count: "exact", head: true }).eq("kind", "AVOID"),
    supabase.from("person_preferences").select("*", { count: "exact", head: true }).eq("kind", "WANT_AGAIN"),
    supabase.from("user_blocks").select("*", { count: "exact", head: true }),
  ]);
  const open = (reports ?? []).filter((r) => r.status === "OPEN");
  const done = (reports ?? []).filter((r) => r.status !== "OPEN");
  const avg = (k: "mood" | "conversation" | "venue" | "rejoin_intent" | "recommend_intent") =>
    fbs?.length ? (fbs.reduce((s, f) => s + (f[k] ?? 0), 0) / fbs.length).toFixed(1) : "-";

  const where = (r: { dining_tables: unknown }) => {
    const t = one<{ table_no: number | null; event_slots: unknown }>(r.dining_tables);
    const s = one<{ event_date: string; region: string }>(t?.event_slots);
    return s ? `${fmtEventDate(s.event_date)} ${REGIONS[s.region as RegionCode]} ${t?.table_no ?? ""}번` : "-";
  };

  return (
    <>
      <h1 className="text-2xl font-bold">피드백·신고 관리</h1>

      <Panel title="만족도 요약" aside={<span className="text-xs text-stone-600">피드백 {fbs?.length ?? 0}건 · 5점 만점 평균</span>}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[["테이블 분위기", avg("mood")], ["대화", avg("conversation")], ["식당", avg("venue")], ["재참여 의향", avg("rejoin_intent")], ["추천 의향", avg("recommend_intent")]].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-stone-300 p-3"><p className="text-xs text-stone-600">{k}</p><p className="text-lg font-bold">{v}</p></div>
          ))}
        </div>
        <p className="text-sm text-stone-700">
          사람별 선호(비공개): 또 만나고 싶어요 <b>{want ?? 0}건</b> · 만나고 싶지 않아요 <b>{avoid ?? 0}건</b> · 차단 <b>{blocks ?? 0}건</b>.
          만나고 싶지 않아요·차단·신고 관계는 다음 매칭에서 같은 테이블에 배정되지 않아요.
        </p>
      </Panel>

      <Panel title="미처리 신고" aside={<span className="text-xs text-stone-600">{open.length}건</span>}>
        {open.length === 0 ? <p className="text-sm text-stone-600">검토할 신고가 없어요.</p> : (
          <div className="flex flex-col gap-3">
            {open.map((r) => {
              const reported = one<P>(r.reported_p);
              return (
                <div key={r.id} className="flex flex-col gap-2 rounded-lg border border-stone-300 p-3 text-sm">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>피신고자 <b>{reported?.name}</b> ({reported ? restrictionText(reported) : "-"})</span>
                    <span>신고자 <b>{one<P>(r.reporter_p)?.name}</b></span>
                    <span>모임 {where(r)}</span>
                    <span className="text-stone-600">{fmtDateTime(r.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-line rounded bg-stone-100 p-2">{r.reason}</p>
                  <form action={reviewReport} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <select name="action" className={`${inputCls} w-auto`} defaultValue="WARNING">
                      {(["NONE", "WARNING", "SUSPEND", "BAN"] as const).map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
                    </select>
                    <button className={btnCls}>검토 완료</button>
                    <span className="text-xs text-stone-600">두 사람은 신고 즉시 다음 매칭부터 분리돼 있어요. 조치 결과만 피신고자에게 알리고 신고자는 알리지 않아요.</span>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="처리한 신고" aside={<span className="text-xs text-stone-600">{done.length}건</span>}>
        {done.length === 0 ? <p className="text-sm text-stone-600">없어요.</p> : (
          <table className={tableCls}>
            <thead><tr><th>피신고자</th><th>신고자</th><th>모임</th><th>조치</th><th>검토 시각</th></tr></thead>
            <tbody>
              {done.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{one<P>(r.reported_p)?.name}</td>
                  <td className="whitespace-nowrap">{one<P>(r.reporter_p)?.name}</td>
                  <td className="whitespace-nowrap">{where(r)}</td>
                  <td><Badge tone={r.action === "NONE" ? "muted" : "solid"}>{ACTION_LABEL[(r.action ?? "NONE") as keyof typeof ACTION_LABEL]}</Badge></td>
                  <td className="whitespace-nowrap text-xs">{r.reviewed_at ? fmtDateTime(r.reviewed_at) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
