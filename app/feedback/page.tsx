import { redirect } from "next/navigation";
import { requireParticipant } from "@/lib/auth";
import { getLatestApplication } from "@/lib/applications";
import { getMyTable } from "@/lib/table";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { fmtEventDate } from "@/lib/time";
import { Card, Screen, TopBar } from "@/components/mobile";
import { FeedbackForm, ReportForm } from "./FeedbackForm";

// 식사 후 피드백 (FDB-02~04)과 신고·차단 (SAF-01)
export default async function FeedbackPage() {
  const { supabase, profile } = await requireParticipant();
  const app = await getLatestApplication(supabase, profile.id);
  if (!app || app.match_status !== "CONFIRMED") redirect("/home");
  const table = await getMyTable(app.id, profile.id);
  if (!table) redirect("/home");
  const { data: done } = await supabase.from("feedbacks").select("id").eq("table_id", table.tableId).eq("profile_id", profile.id).maybeSingle();
  const others = table.members.filter((m) => !m.me).map((m) => ({ id: m.profileId, name: m.name }));

  return (
    <Screen>
      <TopBar title="모임 피드백" back="/table" />
      <div className="flex flex-col gap-4 px-4 py-5">
        <p className="text-sm text-stone-600">
          {fmtEventDate(table.slot.event_date)} {REGIONS[table.slot.region as RegionCode]} {table.tableNo}번 테이블 · 남겨 주신 내용은 상대에게 공개되지 않고 다음 매칭에만 쓰여요.
        </p>
        {app.attendance_status !== "ATTENDED" ? (
          <Card><p className="text-sm">체크인한 뒤에 피드백을 남길 수 있어요.</p></Card>
        ) : done ? (
          <Card><p className="text-sm font-semibold">이 모임의 피드백을 이미 남겼어요. 고마워요!</p></Card>
        ) : (
          <FeedbackForm others={others} />
        )}
        <ReportForm others={others} />
      </div>
    </Screen>
  );
}
