import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { addDays, fmtDateTime, fmtEventDate, fmtTime, todayKST } from "@/lib/time";
import { Badge, Panel, btnLineCls, tableCls } from "@/components/admin";
import { AddAvailabilityForm, CreateVenueForm, MatchingSettingsForm } from "./Forms";
import { toggleAvailability } from "./actions";

const RES: Record<string, { label: string; tone: "solid" | "line" | "muted" }> = {
  AVAILABLE: { label: "예약 가능", tone: "line" },
  RESERVED: { label: "배정됨", tone: "solid" },
  CLOSED: { label: "마감", tone: "muted" },
};

// A-3 식당 재고·자동화 규칙
export default async function VenuesPage({ searchParams }: { searchParams: Promise<{ region?: string }> }) {
  const { region } = await searchParams;
  const filter = region && region in REGIONS ? (region as RegionCode) : null;
  const { supabase } = await requireAdmin();

  let q = supabase.from("venues")
    .select("id, name, region, address, map_url, price_range, rating, venue_availability(id, slot_date, start_time, capacity, reservation_status)")
    .order("region").order("rating", { ascending: false });
  if (filter) q = q.eq("region", filter);
  const [{ data: venues }, { data: settings }] = await Promise.all([
    q,
    supabase.from("matching_settings").select("*").eq("scope", "GLOBAL").single(),
  ]);
  const today = todayKST();
  const defaultDate = addDays(today, 14);

  return (
    <>
      <h1 className="text-2xl font-bold">식당 재고·자동화 규칙</h1>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Panel title="가상 식당 재고" aside={
          <nav aria-label="지역 필터" className="flex flex-wrap gap-1.5 text-xs">
            {[["", "전체"], ...Object.entries(REGIONS)].map(([c, l]) => (
              <Link key={c} href={c ? `/admin/venues?region=${c}` : "/admin/venues"}
                aria-current={(filter ?? "") === c ? "page" : undefined}
                className={`rounded-full border px-2.5 py-1 ${(filter ?? "") === c ? "border-stone-900 bg-stone-900 text-white" : "border-stone-400"}`}>
                {l}
              </Link>
            ))}
          </nav>
        }>
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr><th>식당명</th><th>지역</th><th>주소·지도</th><th>가격대</th><th>평점</th><th>날짜·시간별 수용 인원 · 예약 상태</th></tr></thead>
              <tbody>
                {(venues ?? []).map((v) => {
                  const avail = (v.venue_availability ?? [])
                    .filter((a) => a.slot_date >= today)
                    .sort((a, b) => (a.slot_date + a.start_time).localeCompare(b.slot_date + b.start_time));
                  return (
                    <tr key={v.id}>
                      <td className="font-semibold">{v.name}</td>
                      <td className="whitespace-nowrap">{REGIONS[v.region as RegionCode]}</td>
                      <td>{v.address ?? "-"}{v.map_url && <> · <a href={v.map_url} target="_blank" rel="noreferrer" className="underline">지도</a></>}</td>
                      <td className="whitespace-nowrap">{v.price_range ?? "-"}</td>
                      <td>{v.rating ?? "-"}</td>
                      <td className="min-w-[300px]">
                        {avail.length === 0 ? <span className="text-stone-500">열린 수용 인원 없음</span> : (
                          <ul className="flex flex-col gap-1.5">
                            {avail.map((a) => {
                              const st = RES[a.reservation_status] ?? { label: a.reservation_status, tone: "line" as const };
                              return (
                                <li key={a.id} className="flex items-center gap-2 whitespace-nowrap">
                                  <span className="whitespace-nowrap">{fmtEventDate(a.slot_date)} {fmtTime(a.start_time)} · {a.capacity}명</span>
                                  <Badge tone={st.tone}>{st.label}</Badge>
                                  {a.reservation_status !== "RESERVED" && (
                                    <form action={toggleAvailability}>
                                      <input type="hidden" name="id" value={a.id} />
                                      <input type="hidden" name="to" value={a.reservation_status === "AVAILABLE" ? "CLOSED" : "AVAILABLE"} />
                                      <button className={btnLineCls}>{a.reservation_status === "AVAILABLE" ? "마감" : "다시 열기"}</button>
                                    </form>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-stone-600">자동 배정은 지역·시간·인원이 맞고 예약 가능한 식당 중 평점이 높은 곳을 먼저 골라요.</p>
        </Panel>
        <div className="flex flex-col gap-6">
          <Panel title="식당 등록"><CreateVenueForm defaultDate={defaultDate} /></Panel>
          <Panel title="수용 인원 추가">
            <AddAvailabilityForm defaultDate={defaultDate}
              venues={(venues ?? []).map((v) => ({ id: v.id, label: `${v.name} (${REGIONS[v.region as RegionCode]})` }))} />
          </Panel>
        </div>
      </div>
      <Panel title="매칭 가중치·최소 점수" aside={settings?.updated_at &&
        <span className="text-xs text-stone-600">마지막 변경 {fmtDateTime(settings.updated_at)}</span>}>
        {settings ? (
          <MatchingSettingsForm initial={{
            w_age: settings.w_age, w_gender: settings.w_gender, w_mbti: settings.w_mbti,
            w_interest: settings.w_interest, w_wanted: settings.w_wanted, w_new_people: settings.w_new_people,
            min_score: settings.min_score,
          }} />
        ) : <p className="text-sm">기본 매칭 설정이 없어요. 초기 스키마의 마지막 줄을 확인해 주세요.</p>}
      </Panel>
    </>
  );
}
