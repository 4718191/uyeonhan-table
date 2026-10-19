import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/time";
import { Badge, Panel, btnLineCls, inputCls, tableCls } from "@/components/admin";
import { updateException } from "./actions";

const one = <T,>(x: unknown): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null)) as T | null;

const TYPE_LABELS: Record<string, string> = {
  PAYMENT_ERROR: "결제 오류",
  DATA_MISSING: "데이터 누락",
  CONDITION_CONFLICT: "조건 충돌",
  VENUE_SHORTAGE: "식당 배정 실패",
  DELIVERY_FAILED: "안내 발송 실패",
  REFUND_FAILED: "환불 실패",
};
const STATUS: Record<string, { label: string; tone: "solid" | "line" | "muted" }> = {
  OPEN: { label: "미처리", tone: "solid" },
  IN_PROGRESS: { label: "처리 중", tone: "line" },
  RESOLVED: { label: "처리 완료", tone: "muted" },
};

// A-6 예외 처리함: 자동 처리·재시도 후에도 해결되지 않은 건만 올라온다 (MVP 3장)
export default async function ExceptionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filter = status && status in STATUS ? status : "ACTIVE";
  const { supabase } = await requireAdmin();
  let q = supabase.from("exception_cases")
    .select("id, type, reason, status, action_note, created_at, resolved_at, applications(profiles(name)), dining_tables(table_no)")
    .order("created_at", { ascending: false }).limit(200);
  q = filter === "ACTIVE" ? q.in("status", ["OPEN", "IN_PROGRESS"]) : q.eq("status", filter);
  const { data: rows } = await q;

  return (
    <>
      <h1 className="text-2xl font-bold">예외 처리함</h1>
      <Panel title="예외 목록" aside={
        <nav aria-label="상태 필터" className="flex flex-wrap gap-1.5 text-xs">
          {[["ACTIVE", "처리 필요"], ["OPEN", "미처리"], ["IN_PROGRESS", "처리 중"], ["RESOLVED", "처리 완료"]].map(([k, l]) => (
            <Link key={k} href={k === "ACTIVE" ? "/admin/exceptions" : `/admin/exceptions?status=${k}`} aria-current={filter === k ? "page" : undefined}
              className={`rounded-full border px-2.5 py-1 ${filter === k ? "border-stone-900 bg-stone-900 text-white" : "border-stone-400"}`}>{l}</Link>
          ))}
        </nav>
      }>
        {!rows || rows.length === 0 ? (
          <p className="text-sm text-stone-600">처리할 예외가 없어요. 정상 흐름은 운영자 개입 없이 자동으로 처리되고 있어요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr><th>유형</th><th>대상</th><th>사유</th><th>상태</th><th>발생</th><th>조치</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const who = one<{ name: string }>(one<{ profiles: unknown }>(r.applications)?.profiles)?.name;
                  const table = one<{ table_no: number | null }>(r.dining_tables);
                  const st = STATUS[r.status];
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap font-semibold">{TYPE_LABELS[r.type] ?? r.type}</td>
                      <td className="whitespace-nowrap">{who ?? (table ? `${table.table_no}번 테이블` : "-")}</td>
                      <td className="min-w-[220px] text-xs">{r.reason}</td>
                      <td><Badge tone={st.tone}>{st.label}</Badge></td>
                      <td className="whitespace-nowrap text-xs">{fmtDateTime(r.created_at)}</td>
                      <td className="min-w-[240px]">
                        {r.status === "RESOLVED" ? (
                          <span className="text-xs">{r.action_note} {r.resolved_at && `(${fmtDateTime(r.resolved_at)})`}</span>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {r.status === "OPEN" && (
                              <form action={updateException}>
                                <input type="hidden" name="id" value={r.id} />
                                <input type="hidden" name="to" value="IN_PROGRESS" />
                                <button className={btnLineCls}>처리 시작</button>
                              </form>
                            )}
                            <form action={updateException} className="flex gap-1.5">
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="to" value="RESOLVED" />
                              <label className="flex-1"><span className="sr-only">조치 메모</span>
                                <input name="note" required placeholder="조치 내용" className={`${inputCls} min-h-9 text-xs`} /></label>
                              <button className={btnLineCls}>처리 완료</button>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-stone-600">
          인원 부족·조건 미충족은 자동 재배치로 먼저 해결하므로 여기에 올라오지 않아요. 결제 오류, 데이터 누락, 식당 배정 실패, 반복 발송 실패, 환불 실패만 올라와요.
        </p>
      </Panel>
    </>
  );
}
