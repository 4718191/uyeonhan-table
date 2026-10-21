import { requireAdmin } from "@/lib/auth";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { ACTION_LABEL, countStrikes, isRestricted, restrictionText, suggestAction } from "@/lib/restrictions";
import { fmtEventDate } from "@/lib/time";
import { Badge, Panel, btnCls, btnLineCls, tableCls } from "@/components/admin";
import { liftRestriction, resolveCandidate, restrict } from "./actions";

const one = <T,>(x: unknown): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null)) as T | null;
type Row = { id: string; profile_id: string; attendance_status: string | null; application_status: string; confirmed_slot_id: string | null; profiles: unknown };
type Prof = { id: string; name: string; restriction_level: number; restricted_until: string | null };

// A-9 참석·취소·노쇼 관리 (PRD 11장 참석 관리, FDB-01, SAF-02)
export default async function AttendancePage() {
  const { supabase } = await requireAdmin();
  const { data: slots } = await supabase.from("event_slots").select("id, event_date, region, status").in("status", ["MATCHED", "CLOSED"]).order("event_date");
  const slotById = new Map((slots ?? []).map((s) => [s.id, s]));
  const closedIds = (slots ?? []).filter((s) => s.status === "CLOSED").map((s) => s.id);

  const { data: rows } = await supabase.from("applications")
    .select("id, profile_id, attendance_status, application_status, confirmed_slot_id, profiles(id, name, restriction_level, restricted_until)")
    .in("confirmed_slot_id", (slots ?? []).map((s) => s.id)).not("attendance_status", "is", null).limit(2000);
  const apps = (rows ?? []) as Row[];

  // 회차(날짜)별 참석 현황
  const byDate = new Map<string, { confirmed: number; attended: number; canceled: number; candidates: number; noShow: number; closed: boolean }>();
  for (const a of apps) {
    const s = slotById.get(a.confirmed_slot_id!);
    if (!s) continue;
    const c = byDate.get(s.event_date) ?? { confirmed: 0, attended: 0, canceled: 0, candidates: 0, noShow: 0, closed: s.status === "CLOSED" };
    c.confirmed++;
    if (a.attendance_status === "ATTENDED") c.attended++;
    else if (a.attendance_status === "CANCELED_LATE" || a.attendance_status === "CANCELED_EARLY") c.canceled++;
    else if (a.attendance_status === "NO_SHOW") c.noShow++;
    else if (a.attendance_status === "SCHEDULED" && s.status === "CLOSED" && a.application_status === "SUBMITTED") c.candidates++;
    byDate.set(s.event_date, c);
  }

  const candidates = apps.filter((a) => a.attendance_status === "SCHEDULED" && a.application_status === "SUBMITTED" && closedIds.includes(a.confirmed_slot_id!));
  // 노쇼·당일 취소 누적과 제한 제안
  const flagged = apps.filter((a) => a.attendance_status === "NO_SHOW" || a.attendance_status === "CANCELED_LATE");
  const strikes = await countStrikes(supabase, [...new Set(flagged.map((a) => a.profile_id))]);
  const people = [...strikes.entries()].map(([pid, c]) => {
    const p = one<Prof>(flagged.find((a) => a.profile_id === pid)?.profiles);
    return { pid, name: p?.name ?? "", p, total: c.noShow + c.sameDay, ...c };
  }).filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
  const { data: restricted } = await supabase.from("profiles").select("id, name, restriction_level, restricted_until").gt("restriction_level", 0).order("restriction_level", { ascending: false });

  return (
    <>
      <h1 className="text-2xl font-bold">참석·취소·노쇼 관리</h1>

      <Panel title="회차별 참석 현황">
        <table className={tableCls}>
          <thead><tr><th>행사일</th><th>상태</th><th>확정</th><th>체크인(참석)</th><th>확정 후 취소</th><th>노쇼 후보</th><th>노쇼 확정</th></tr></thead>
          <tbody>
            {[...byDate.entries()].map(([d, c]) => (
              <tr key={d}>
                <td className="whitespace-nowrap font-semibold">{fmtEventDate(d)}</td>
                <td><Badge tone={c.closed ? "muted" : "line"}>{c.closed ? "종료" : "진행 예정"}</Badge></td>
                <td>{c.confirmed}명</td><td>{c.attended}명</td><td>{c.canceled}명</td>
                <td className={c.candidates ? "font-bold" : ""}>{c.candidates}명</td><td>{c.noShow}명</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-stone-600">행사가 끝날 때까지 체크인하지 않은 확정자만 노쇼 후보로 올라와요. 체크인한 사람과 미리 취소한 사람은 자동으로 기록돼요.</p>
      </Panel>

      <Panel title="노쇼 후보 확인" aside={<span className="text-xs text-stone-600">{candidates.length}명</span>}>
        {candidates.length === 0 ? <p className="text-sm text-stone-600">확인할 노쇼 후보가 없어요.</p> : (
          <>
            <form action={resolveCandidate} className="flex flex-wrap items-center gap-2">
              {candidates.map((a) => <input key={a.id} type="hidden" name="id" value={a.id} />)}
              <input type="hidden" name="to" value="NO_SHOW" />
              <button className={btnCls}>후보 {candidates.length}명 모두 노쇼 확정</button>
              <span className="text-xs text-stone-600">현장에서 참석을 확인한 사람은 먼저 아래에서 &quot;참석으로 정정&quot;해 주세요.</span>
            </form>
            <div className="max-h-[420px] overflow-auto">
              <table className={tableCls}>
                <thead><tr><th>참가자</th><th>행사</th><th>현재 제한</th><th>처리</th></tr></thead>
                <tbody>
                  {candidates.map((a) => {
                    const p = one<Prof>(a.profiles);
                    const s = slotById.get(a.confirmed_slot_id!);
                    return (
                      <tr key={a.id}>
                        <td className="whitespace-nowrap font-semibold">{p?.name}</td>
                        <td className="whitespace-nowrap">{s && `${fmtEventDate(s.event_date)} ${REGIONS[s.region as RegionCode]}`}</td>
                        <td className="text-xs">{p ? restrictionText(p) : "-"}</td>
                        <td>
                          <div className="flex gap-1.5">
                            {/* 버튼마다 폼을 나눠 어떤 처리인지 hidden 값으로 보낸다 */}
                            <form action={resolveCandidate}>
                              <input type="hidden" name="id" value={a.id} /><input type="hidden" name="to" value="NO_SHOW" />
                              <button className={btnLineCls}>노쇼 확정</button>
                            </form>
                            <form action={resolveCandidate}>
                              <input type="hidden" name="id" value={a.id} /><input type="hidden" name="to" value="ATTENDED" />
                              <button className={btnLineCls}>참석으로 정정</button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <Panel title="이용 제한 제안" aside={<span className="text-xs text-stone-600">노쇼·당일 취소 1회 경고 · 2회 4주 제한 · 3회 영구 제한</span>}>
        {people.length === 0 ? <p className="text-sm text-stone-600">노쇼·당일 취소 기록이 있는 참가자가 없어요.</p> : (
          <table className={tableCls}>
            <thead><tr><th>참가자</th><th>노쇼</th><th>당일 취소</th><th>현재 제한</th><th>시스템 제안</th><th>확정</th></tr></thead>
            <tbody>
              {people.map((x) => {
                const sug = suggestAction(x.total);
                const already = x.p && sug && x.p.restriction_level >= { WARNING: 1, SUSPEND: 2, BAN: 3 }[sug] && (sug !== "SUSPEND" || isRestricted(x.p));
                return (
                  <tr key={x.pid}>
                    <td className="whitespace-nowrap font-semibold">{x.name}</td>
                    <td>{x.noShow}회</td><td>{x.sameDay}회</td>
                    <td className="text-xs">{x.p ? restrictionText(x.p) : "-"}</td>
                    <td>{sug ? <Badge tone="solid">{ACTION_LABEL[sug]}</Badge> : "-"}</td>
                    <td>
                      {sug && !already ? (
                        <form action={restrict}>
                          <input type="hidden" name="profile" value={x.pid} />
                          <input type="hidden" name="action" value={sug} />
                          <input type="hidden" name="reason" value={`노쇼 ${x.noShow}회·당일 취소 ${x.sameDay}회 누적`} />
                          <button className={btnLineCls}>{ACTION_LABEL[sug]} 적용</button>
                        </form>
                      ) : <span className="text-xs text-stone-600">적용됨</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="text-xs text-stone-600">당일 취소는 행사 당일 참석 취소예요. 그 전에 한 확정 후 취소는 환불만 없고 이용 제한 횟수에는 넣지 않아요.</p>
      </Panel>

      <Panel title="이용 제한 중인 참가자" aside={<span className="text-xs text-stone-600">{restricted?.length ?? 0}명</span>}>
        {!restricted?.length ? <p className="text-sm text-stone-600">없어요.</p> : (
          <table className={tableCls}>
            <thead><tr><th>참가자</th><th>단계</th><th>신청·매칭</th><th></th></tr></thead>
            <tbody>
              {restricted.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap font-semibold">{p.name}</td>
                  <td>{restrictionText(p)}</td>
                  <td>{isRestricted(p) ? <Badge tone="solid">막힘</Badge> : <Badge tone="muted">가능</Badge>}</td>
                  <td><form action={liftRestriction}><input type="hidden" name="profile" value={p.id} /><button className={btnLineCls}>해제</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
