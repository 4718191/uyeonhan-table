import { redirect } from "next/navigation";
import { requireParticipant } from "@/lib/auth";
import { getApplication, getApplications } from "@/lib/applications";
import { getMyTable } from "@/lib/table";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { fmtEventDate } from "@/lib/time";
import { Card, Screen, TopBar } from "@/components/mobile";
import { FeedbackForm, ReportForm } from "./FeedbackForm";

// 식사 후 피드백 (FDB-02~04)과 신고·차단 (SAF-01)
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const { app: appId } = await searchParams;
  const { supabase, profile } = await requireParticipant();
  // ?app= 로 고른 모임, 없으면 가장 최근에 확정된 모임
  const app = appId
    ? await getApplication(supabase, appId)
    : (await getApplications(supabase, profile.id)).find((a) => a.match_status === "CONFIRMED") ?? null;
  if (!app || app.profile_id !== profile.id || app.match_status !== "CONFIRMED") redirect("/history");
  const table = await getMyTable(app.id, profile.id);
  if (!table) redirect("/history");
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
          <FeedbackForm applicationId={app.id} others={others} />
        )}
        <ReportForm applicationId={app.id} others={others} />
      </div>
    </Screen>
  );
}
