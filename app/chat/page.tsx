import { redirect } from "next/navigation";
import { requireParticipant } from "@/lib/auth";
import { getLatestApplication } from "@/lib/applications";
import { getMyTable } from "@/lib/table";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { fmtDateTime, fmtEventDate } from "@/lib/time";
import { TopBar } from "@/components/mobile";
import { AutoRefresh, ScrollToEnd, SendForm } from "./ChatClient";

const KIND_LABEL: Record<string, string> = {
  NOTICE: "공지 · 확정 즉시 자동 게시",
  REMINDER: "리마인드 · 행사 1일 전",
  CONTENT: "오늘의 대화 주제",
};

// P-8 앱 단체방: 시스템 공지(확정 안내·리마인드·대화 콘텐츠)와 참가자 대화
export default async function ChatPage() {
  const { supabase, profile } = await requireParticipant();
  const app = await getLatestApplication(supabase, profile.id);
  if (!app || app.match_status !== "CONFIRMED") redirect("/home");
  const table = await getMyTable(app.id, profile.id);
  if (!table?.roomId) redirect("/home");

  // 내 테이블의 단체방임을 위에서 확인했으므로 서버에서 해당 방 메시지만 읽는다
  const { data: messages } = await createAdminClient()
    .from("chat_messages")
    .select("id, kind, body, sender_profile_id, created_at")
    .eq("room_id", table.roomId)
    .order("created_at");
  const names = new Map(table.members.map((m) => [m.profileId, m.name]));

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-stone-100">
      <TopBar title={`${fmtEventDate(table.slot.event_date)} ${REGIONS[table.slot.region as RegionCode]} ${table.tableNo}번 테이블`} back="/table" />
      <p className="border-b border-stone-300 bg-white px-4 py-1.5 text-xs text-stone-600">
        참가자 {table.members.length}명 · {table.members.map((m) => m.name).join(", ")}
      </p>
      <div className="flex flex-1 flex-col gap-3 px-4 py-4">
        {(messages ?? []).map((m) => {
          if (m.kind !== "USER") {
            return (
              <section key={m.id} className="flex flex-col gap-1.5 rounded-xl border-[1.5px] border-stone-400 bg-white p-3.5 text-sm leading-relaxed">
                <span className="text-xs font-bold">{KIND_LABEL[m.kind] ?? "안내"}</span>
                <p className="whitespace-pre-line [overflow-wrap:anywhere]">{linkify(m.body)}</p>
              </section>
            );
          }
          const mine = m.sender_profile_id === profile.id;
          return (
            <div key={m.id} className={`flex max-w-[80%] flex-col gap-0.5 ${mine ? "self-end items-end" : "self-start"}`}>
              {!mine && <span className="text-xs text-stone-600">{names.get(m.sender_profile_id ?? "") ?? "참가자"}</span>}
              <p className={`whitespace-pre-line rounded-2xl px-3.5 py-2 text-[15px] [overflow-wrap:anywhere] ${mine ? "bg-stone-900 text-white" : "border-[1.5px] border-stone-300 bg-white"}`}>{linkify(m.body)}</p>
              <span className="text-[11px] text-stone-500">{fmtDateTime(m.created_at)}</span>
            </div>
          );
        })}
        <ScrollToEnd />
      </div>
      <SendForm roomId={table.roomId} />
      <AutoRefresh />
    </div>
  );
}

// 공지 속 긴 주소는 짧은 링크로 보여 준다 (지도 주소는 "지도 보기")
function linkify(text: string) {
  return text.split(/(https?:\/\/\S+?)(?=\)|\s|$)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer" className="font-semibold underline">
        {/map\.naver\.com|maps?\.(google|kakao)/.test(part) ? "지도 보기" : "링크 열기"}
      </a>
    ) : part,
  );
}
