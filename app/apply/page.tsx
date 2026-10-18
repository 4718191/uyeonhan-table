import Link from "next/link";
import { redirect } from "next/navigation";
import { requireParticipant } from "@/lib/auth";
import { getLatestApplication, isOngoing } from "@/lib/applications";
import { REGIONS } from "@/lib/constants";
import { fmtDeadline, fmtEventDate, fmtTime } from "@/lib/time";
import { Card, Screen, TopBar, btnSecondary } from "@/components/mobile";
import { ApplyForm, type DateOption } from "./ApplyForm";

// P-3 모집 일정·지역 선택
export default async function ApplyPage() {
  const { supabase, profile } = await requireParticipant();

  const latest = await getLatestApplication(supabase, profile.id);
  if (isOngoing(latest)) {
    if (latest!.payment_status === "PENDING") redirect(`/apply/${latest!.id}/pay`);
    redirect("/home");
  }

  const { data: slots } = await supabase
    .from("event_slots")
    .select("event_date, start_time, apply_deadline")
    .eq("status", "OPEN")
    .gt("apply_deadline", new Date().toISOString())
    .order("event_date");

  const byDate = new Map<string, DateOption>();
  for (const s of slots ?? []) {
    if (!byDate.has(s.event_date)) {
      byDate.set(s.event_date, {
        date: s.event_date,
        label: fmtEventDate(s.event_date),
        time: fmtTime(s.start_time),
        deadline: fmtDeadline(s.apply_deadline),
      });
    }
  }
  const dates = [...byDate.values()];
  const regions = Object.entries(REGIONS).map(([code, label]) => ({ code, label }));

  return (
    <Screen>
      <TopBar title="일정·지역 선택" back="/home" step="2 / 3" />
      <div className="flex flex-col gap-4 px-4 py-5">
        {dates.length === 0 ? (
          <Card>
            <h2 className="text-base font-bold">지금은 모집 중인 일정이 없어요</h2>
            <p className="text-sm text-stone-600">새 모집이 열리면 앱 알림으로 알려 드릴게요.</p>
            <Link href="/home" className={btnSecondary}>홈으로</Link>
          </Card>
        ) : (
          <>
            <p className="text-sm text-stone-600">
              참가 가능한 날짜와 지역을 모두 골라 주세요. 많이 고를수록 매칭될 가능성이 높아져요.
              확정되면 그중 한 회차에만 배정돼요.
            </p>
            <ApplyForm dates={dates} regions={regions} />
          </>
        )}
      </div>
    </Screen>
  );
}
