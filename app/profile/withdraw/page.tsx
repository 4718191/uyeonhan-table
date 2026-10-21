import { requireParticipant } from "@/lib/auth";
import { getActiveMembership, getApplications, getStoredSingle, membershipEnd } from "@/lib/applications";
import { fmtEventDate } from "@/lib/time";
import { Card, Screen, TopBar } from "@/components/mobile";
import { WithdrawForm } from "./WithdrawForm";
import { blockingReason } from "./rules";

// 회원 탈퇴
export default async function WithdrawPage() {
  const { supabase, profile } = await requireParticipant();
  const [apps, membership, stored] = await Promise.all([
    getApplications(supabase, profile.id), getActiveMembership(supabase, profile.id), getStoredSingle(supabase, profile.id),
  ]);
  const blocked = blockingReason(apps);

  return (
    <Screen>
      <TopBar title="회원 탈퇴" back="/profile" />
      <div className="flex flex-col gap-4 px-4 py-5">
        <Card>
          <h2 className="text-base font-bold">탈퇴하면 이렇게 처리돼요</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
            <li>이름·연락처·직업·식사 조건과 매칭 프로필은 바로 지워지고, 로그인 계정이 삭제돼요.</li>
            <li>결제·환불·참가 기록은 정산과 분쟁 대응을 위해 이름 없이 익명으로 보관돼요.</li>
            <li>다른 참가자가 남긴 차단·신고 기록은 그분의 안전을 위해 남아요.</li>
            {membership && <li><b>남은 멤버십({fmtEventDate(membershipEnd(membership)!)}까지)은 사라지고 환불되지 않아요.</b></li>}
            {stored && <li><b>보관한 1회권은 사라지고 환불되지 않아요.</b></li>}
            <li>같은 이메일로 다시 가입할 수 있지만, 이전 기록은 이어지지 않아요.</li>
          </ul>
        </Card>
        {blocked ? (
          <Card><p className="text-sm font-semibold">지금은 탈퇴할 수 없어요.</p><p className="text-sm">{blocked}</p></Card>
        ) : (
          <WithdrawForm />
        )}
      </div>
    </Screen>
  );
}
