import Link from "next/link";
import { redirect } from "next/navigation";
import { requireParticipant } from "@/lib/auth";
import { getLatestApplication } from "@/lib/applications";
import { getMyTable } from "@/lib/table";
import { mapLink } from "@/lib/map";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { fmtEventDate, fmtTime } from "@/lib/time";
import { BottomNav, Card, Screen, TopBar, btnPrimary } from "@/components/mobile";

// P-7 매칭 확정 상세: 날짜·시간·식당·예약명·함께할 사람(제한된 소개)·단체방 입장
export default async function TablePage() {
  const { supabase, profile } = await requireParticipant();
  const app = await getLatestApplication(supabase, profile.id);
  if (!app || app.match_status !== "CONFIRMED") redirect("/home");
  const table = await getMyTable(app.id, profile.id);
  if (!table) redirect("/home");

  const others = table.members.filter((m) => !m.me);
  const me = table.members.find((m) => m.me);
  const shared = [...new Set(others.flatMap((o) => o.interests.filter((i) => me?.interests.includes(i))))];

  return (
    <Screen>
      <TopBar title="매칭 확정" back="/home" />
      <div className="flex flex-col gap-4 px-4 py-5">
        <Card strong>
          <p className="text-sm font-semibold text-stone-600">확정된 모임</p>
          <h1 className="text-[22px] font-bold">
            {fmtEventDate(table.slot.event_date)} {fmtTime(table.slot.start_time)}
          </h1>
          <dl className="grid grid-cols-[64px_1fr] gap-y-2 text-sm">
            <dt className="text-stone-600">지역</dt><dd>{REGIONS[table.slot.region as RegionCode]}</dd>
            <dt className="text-stone-600">식당</dt>
            <dd>
              <span className="font-semibold">{table.venue?.name ?? "배정 확인 중"}</span>
              {table.venue?.rating && <span className="text-stone-600"> · 평점 {table.venue.rating}</span>}
              {table.venue?.price_range && <span className="text-stone-600"> · {table.venue.price_range}</span>}
            </dd>
            <dt className="text-stone-600">주소</dt>
            <dd>
              {table.venue?.address ?? "-"}
              {table.venue && mapLink(table.venue) && <> · <a href={mapLink(table.venue)!} target="_blank" rel="noreferrer" className="underline">지도 보기</a></>}
            </dd>
            <dt className="text-stone-600">예약명</dt><dd>우연한 식탁 {table.tableNo}번 테이블</dd>
            <dt className="text-stone-600">인원</dt><dd>{table.members.length}명</dd>
          </dl>
          {table.roomId && <Link href="/chat" className={btnPrimary}>단체방 입장</Link>}
        </Card>

        <Card>
          <h2 className="text-base font-bold">함께할 분들</h2>
          <p className="text-xs text-stone-600">개인정보 보호를 위해 이름과 관심사·성향만 보여요.</p>
          <ul className="flex flex-col gap-3">
            {others.map((o) => (
              <li key={o.profileId} className="flex flex-col gap-1.5 border-t border-stone-200 pt-3 first:border-t-0 first:pt-0">
                <span className="font-semibold">{o.name}</span>
                <span className="flex flex-wrap gap-1.5">
                  {o.interests.map((i) => (
                    <span key={i} className={`rounded-full px-2.5 py-0.5 text-[13px] ${me?.interests.includes(i) ? "bg-stone-900 text-white" : "border-[1.5px] border-stone-400"}`}>{i}</span>
                  ))}
                </span>
                {o.selfTraits.length > 0 && <span className="text-[13px] text-stone-600">{o.selfTraits.join(" · ")}</span>}
              </li>
            ))}
          </ul>
          {shared.length > 0 && <p className="text-sm">나와 겹치는 관심사(검은색): <b>{shared.join(", ")}</b></p>}
        </Card>

        <Card>
          <h2 className="text-base font-bold">취소·노쇼 정책</h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] leading-relaxed">
            <li>매칭 마감 이후 취소는 환불되지 않아요.</li>
            <li>당일 취소와 노쇼는 이용 제한 대상이에요.</li>
            <li>행사 당일에는 단체방을 나갈 수 없어요. 지각·변경 연락은 단체방으로 해 주세요.</li>
          </ul>
        </Card>
      </div>
      <BottomNav current="home" chatHref="/chat" />
    </Screen>
  );
}
