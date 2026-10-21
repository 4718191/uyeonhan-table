import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { loadApplicants } from "@/lib/admin-data";
import { REGIONS } from "@/lib/constants";
import { won } from "@/lib/labels";
import { Badge, Panel, btnCls, btnLineCls, inputCls, tableCls } from "@/components/admin";

export const maxDuration = 60;

const PAY_FILTER: Record<string, string[]> = { 결제대기: ["PENDING"], 결제완료: ["PAID"], 환불가능: ["REFUND_AVAILABLE"], 환불완료: ["REFUNDED"], 환불실패: ["REFUND_FAILED"], 환불처리중: ["REFUND_REQUESTED", "REFUND_PROCESSING"] };
const MATCH_FILTER: Record<string, string[]> = { 대기: ["WAITING", "REALLOCATING", "TRANSFERRED"], 확정: ["CONFIRMED"], 실패: ["ALTERNATIVE_OFFERED", "NO_MATCH"], 예외: ["EXCEPTION"] };

// A-4 신청자·결제·자동 환불 목록 (PRD 11장 신청자 목록·결제·환불)
export default async function ApplicantsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const all = await loadApplicants(supabase);
  const rows = all.filter((r) =>
    (!sp.q || r.name.includes(sp.q)) &&
    (!sp.pay || PAY_FILTER[sp.pay]?.includes(r.raw.payment)) &&
    (!sp.match || MATCH_FILTER[sp.match]?.includes(r.raw.match)) &&
    (!sp.region || r.raw.regions.includes(sp.region)) &&
    (!sp.canceled || r.raw.application === "CANCELED"));

  const count = (f: (r: typeof all[number]) => boolean) => all.filter(f).length;
  const sum = (f: (r: typeof all[number]) => number) => all.reduce((s, r) => s + f(r), 0);
  const tiles: [string, string][] = [
    ["전체 신청", `${count((r) => r.raw.application === "SUBMITTED")}건`],
    ["결제 완료", `${count((r) => r.raw.payment === "PAID")}건`],
    ["결제 대기", `${count((r) => r.raw.payment === "PENDING" && r.raw.application === "SUBMITTED")}건`],
    ["환불 선택 대기", `${count((r) => r.raw.payment === "REFUND_AVAILABLE")}건`],
    ["자동 환불 완료", `${count((r) => r.raw.payment === "REFUNDED")}건 · ${won(sum((r) => r.refunded ?? 0))}`],
    ["자동 환불 실패", `${count((r) => r.raw.payment === "REFUND_FAILED")}건`],
  ];
  const shown = rows.slice(0, 300);

  return (
    <>
      <h1 className="text-2xl font-bold">신청자·결제·환불</h1>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {tiles.map(([k, v]) => <div key={k} className="rounded-xl border-[1.5px] border-stone-400 bg-white p-4"><p className="text-xs text-stone-600">{k}</p><p className="text-lg font-bold">{v}</p></div>)}
      </section>

      <Panel title="신청자 목록" aside={
        <span className="flex gap-2">
          {/* 파일 다운로드라 페이지 이동(Link)이 아니라 일반 링크를 쓴다 */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/admin/export/applicants" download className={btnLineCls + " inline-flex items-center"}>참가자 CSV</a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/admin/export/tables" download className={btnLineCls + " inline-flex items-center"}>테이블 결과 CSV</a>
        </span>}>
        <form className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <input name="q" defaultValue={sp.q} placeholder="이름 검색" className={inputCls} />
          <select name="pay" defaultValue={sp.pay ?? ""} className={inputCls}><option value="">결제 상태 전체</option>{Object.keys(PAY_FILTER).map((k) => <option key={k}>{k}</option>)}</select>
          <select name="match" defaultValue={sp.match ?? ""} className={inputCls}><option value="">매칭 상태 전체</option>{Object.keys(MATCH_FILTER).map((k) => <option key={k}>{k}</option>)}</select>
          <select name="region" defaultValue={sp.region ?? ""} className={inputCls}><option value="">지역 전체</option>{Object.entries(REGIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="canceled" value="1" defaultChecked={!!sp.canceled} className="h-4 w-4 accent-stone-900" />취소만</label>
          <span className="flex gap-2"><button className={btnCls}>검색</button><Link href="/admin/applicants" className={btnLineCls + " inline-flex items-center"}>초기화</Link></span>
        </form>
        <p className="text-xs text-stone-600">{rows.length}건{rows.length > shown.length ? ` 중 ${shown.length}건 표시 (전체는 CSV로)` : ""}</p>
        <div className="max-h-[640px] overflow-auto">
          <table className={tableCls}>
            <thead><tr><th>이름</th><th>출생·성별</th><th>희망 일정·지역</th><th>이용권·결제</th><th>매칭</th><th>확정·참석</th><th>이전 이력</th><th>제한</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap font-semibold">{r.name}<div className="text-xs font-normal text-stone-600">{r.created}</div></td>
                  <td className="whitespace-nowrap">{r.birthYear} · {r.gender}</td>
                  <td className="min-w-[160px] text-xs">{r.dates}<br />{r.regions}</td>
                  <td className="whitespace-nowrap text-xs">{r.pass}<br /><Badge tone={r.raw.payment === "PAID" ? "solid" : r.raw.payment.startsWith("REFUND") ? "line" : "muted"}>{r.payment}</Badge>{r.refunded ? ` ${won(r.refunded)}` : ""}</td>
                  <td className="min-w-[160px] text-xs"><b>{r.match}</b>{r.reason && <div className="text-stone-600">{r.reason}</div>}</td>
                  <td className="whitespace-nowrap text-xs">{r.confirmed || "-"}<br />{r.attendance}</td>
                  <td className="whitespace-nowrap text-xs">참석 {r.history.attended} · 노쇼 {r.history.noShow} · 신고 {r.history.reported}</td>
                  <td className="whitespace-nowrap text-xs">{r.restriction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
