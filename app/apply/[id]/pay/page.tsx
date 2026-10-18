import { redirect } from "next/navigation";
import { requireParticipant } from "@/lib/auth";
import { getActiveMembership, getApplication, membershipEnd, nextDeadline } from "@/lib/applications";
import { PASS_PRICES, REGIONS, type RegionCode } from "@/lib/constants";
import { PASS_LABELS } from "@/lib/labels";
import { fmtDeadline, fmtEventDate } from "@/lib/time";
import { Card, Screen, TopBar } from "@/components/mobile";
import { PayForm } from "./PayForm";

// P-4 이용권·결제
export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireParticipant();
  const app = await getApplication(supabase, id);
  if (!app || app.profile_id !== profile.id) redirect("/home");
  if (app.application_status !== "SUBMITTED" || app.payment_status !== "PENDING") redirect("/home");

  const owned = await getActiveMembership(supabase, profile.id);
  const deadline = nextDeadline(app);
  const dates = [...new Set(app.slots.map((s) => s.event_date))].map(fmtEventDate);
  const regions = [...new Set(app.slots.map((s) => REGIONS[s.region as RegionCode]))];

  return (
    <Screen>
      <TopBar title="이용권·결제" back="/home" step="3 / 3" />
      <div className="flex flex-col gap-4 px-4 py-5">
        <Card>
          <h2 className="text-base font-bold">신청 내용</h2>
          <dl className="grid grid-cols-[56px_1fr] gap-y-1.5 text-sm">
            <dt className="text-stone-600">날짜</dt><dd>{dates.join(", ")}</dd>
            <dt className="text-stone-600">지역</dt><dd>{regions.join(", ")}</dd>
          </dl>
        </Card>
        {deadline ? (
          <PayForm
            applicationId={app.id}
            deadline={fmtDeadline(deadline)}
            owned={owned ? {
              value: "OWNED",
              name: `보유 ${PASS_LABELS[owned.type]}`,
              price: 0,
              note: `${fmtEventDate(membershipEnd(owned)!)}까지 사용 가능`,
            } : null}
            single={{ value: "SINGLE", name: "1회권", price: PASS_PRICES.SINGLE }}
            memberships={(["MEMBERSHIP_1M", "MEMBERSHIP_3M", "MEMBERSHIP_6M"] as const).map((k) => ({
              value: k, name: PASS_LABELS[k], price: PASS_PRICES[k],
            }))}
          />
        ) : (
          <Card>
            <p className="text-sm">신청한 회차의 마감이 지났어요. 홈에서 이 신청을 취소하고 다른 일정으로 다시 신청해 주세요.</p>
          </Card>
        )}
      </div>
    </Screen>
  );
}
