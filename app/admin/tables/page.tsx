import { requireAdmin } from "@/lib/auth";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { fmtDateTime, fmtEventDate, fmtTime } from "@/lib/time";
import { Badge, Panel, tableCls } from "@/components/admin";

const one = <T,>(x: unknown): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null)) as T | null;

// A-7 테이블·식당·단체방 조회 (PRD 11장 테이블 상세: 참가자 구성, 자동 배정 식당, 단체방, 안내 발송 상태)
export default async function TablesPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const { supabase } = await requireAdmin();
  const { data: tables } = await supabase.from("dining_tables")
    .select("id, table_no, size, total_score, status, confirmed_at, event_slots!inner(event_date, start_time, region), venue_availability(venues(name, address)), chat_rooms(id, chat_messages(kind, delivery_status)), table_members(active, applications(attendance_status, profiles(name)))")
    .order("created_at").limit(500);
  const all = (tables ?? []).map((t) => ({ ...t, slot: one<{ event_date: string; start_time: string; region: string }>(t.event_slots)! }));
  const dates = [...new Set(all.map((t) => t.slot.event_date))].sort();
  const pick = date ?? dates[0];
  const list = all.filter((t) => t.slot.event_date === pick).sort((a, b) => a.slot.region.localeCompare(b.slot.region) || (a.table_no ?? 0) - (b.table_no ?? 0));

  return (
    <>
      <h1 className="text-2xl font-bold">테이블·식당·단체방</h1>
      <nav className="flex flex-wrap gap-2">
        {dates.map((d) => (
          <a key={d} href={`/admin/tables?date=${d}`} className={`rounded-full px-3 py-1 text-sm ${d === pick ? "bg-stone-900 text-white" : "border border-stone-400 bg-white"}`}>{fmtEventDate(d)}</a>
        ))}
      </nav>
      <Panel title={pick ? `${fmtEventDate(pick)} 테이블 ${list.length}개` : "테이블이 없어요"}>
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead><tr><th>지역·번호</th><th>상태</th><th>인원·점수</th><th>식당</th><th>단체방 자동 안내</th><th>참가자 (참석 상태)</th><th>확정 시각</th></tr></thead>
            <tbody>
              {list.map((t) => {
                const v = one<{ name: string; address: string | null }>(one<{ venues: unknown }>(t.venue_availability)?.venues);
                const room = one<{ id: string; chat_messages: { kind: string; delivery_status: string }[] }>(t.chat_rooms);
                const kinds = (k: string) => room?.chat_messages?.find((m) => m.kind === k);
                const members = ((t.table_members as { active: boolean; applications: unknown }[]) ?? []).filter((m) => m.active).map((m) => {
                  const a = one<{ attendance_status: string | null; profiles: unknown }>(m.applications);
                  return `${one<{ name: string }>(a?.profiles)?.name ?? ""}${a?.attendance_status === "ATTENDED" ? "✓" : a?.attendance_status === "NO_SHOW" ? "(노쇼)" : a?.attendance_status === "CANCELED_LATE" ? "(취소)" : ""}`;
                });
                return (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap font-semibold">{REGIONS[t.slot.region as RegionCode]} {t.table_no}번<div className="text-xs font-normal text-stone-600">{fmtTime(t.slot.start_time)}</div></td>
                    <td><Badge tone={t.status === "CONFIRMED" ? "solid" : t.status === "DISSOLVED" ? "muted" : "line"}>{t.status === "CONFIRMED" ? "확정" : t.status === "DISSOLVED" ? "해제" : "식당 확인 필요"}</Badge></td>
                    <td className="whitespace-nowrap">{t.size}명 · {t.total_score}점</td>
                    <td className="text-xs">{v ? <><b>{v.name}</b><br />{v.address}</> : "-"}</td>
                    <td className="whitespace-nowrap text-xs">
                      {room ? (["NOTICE", "REMINDER", "CONTENT"] as const).map((k) => {
                        const m = kinds(k);
                        return <div key={k}>{{ NOTICE: "확정 공지", REMINDER: "1일 전 리마인드", CONTENT: "대화 콘텐츠" }[k]}: {m ? (m.delivery_status === "SENT" ? "발송" : "실패") : "예정"}</div>;
                      }) : "단체방 없음"}
                    </td>
                    <td className="min-w-[220px] text-xs">{members.join(", ")}</td>
                    <td className="whitespace-nowrap text-xs">{t.confirmed_at ? fmtDateTime(t.confirmed_at) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-stone-600">✓ 체크인. 단체방 메시지 내용은 참가자 대화 보호를 위해 이 화면에서 보여 주지 않고 발송 상태만 보여요.</p>
      </Panel>
    </>
  );
}
