import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { getActiveMembership, membershipEnd } from "@/lib/applications";
import { PASS_LABELS } from "@/lib/labels";
import { fmtEventDate } from "@/lib/time";
import { BottomNav, Card, Screen, TopBar, btnPrimary } from "@/components/mobile";

// 내 정보 (보기). 수정은 "회원 정보 수정" 버튼으로 따로 들어간다.
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const { supabase, profile } = await requireProfile();
  if (!profile) redirect("/profile/edit");
  if (profile.role === "admin") redirect("/admin");

  const membership = await getActiveMembership(supabase, profile.id);

  return (
    <Screen>
      <TopBar title="내 정보" />
      <div className="flex flex-col gap-4 px-4 py-5">
        {saved && <p role="status" className="text-sm font-semibold">회원 정보를 저장했어요.</p>}

        <Card>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-900 text-lg font-bold text-white">
              {profile.name.slice(0, 1)}
            </span>
            <div className="flex flex-col">
              <span className="text-lg font-bold">{profile.name}</span>
              <span className="text-sm text-stone-600">
                {[profile.gender === "F" ? "여" : profile.gender === "M" ? "남" : null,
                  profile.birth_year ? `${profile.birth_year}년생` : null,
                  profile.job].filter(Boolean).join(" · ")}
              </span>
            </div>
          </div>
          <Info label="연락처" value={profile.phone ?? "미입력"} />
        </Card>

        <Card>
          <h2 className="text-base font-bold">매칭 프로필</h2>
          <Info label="MBTI" value={profile.mbti ?? "미입력"} />
          <Tags label="요즘 관심사" items={profile.interests} />
          <Tags label="나는 이런 사람" items={profile.self_traits} />
          <Tags label="만나고 싶은 사람" items={profile.wanted_traits} />
        </Card>

        <Card>
          <h2 className="text-base font-bold">식사 조건</h2>
          <Tags label="희망 가격대" items={profile.price_ranges} />
          <Info label="못 먹는 음식" value={profile.food_restrictions ?? "없음"} />
        </Card>

        <Card>
          <h2 className="text-base font-bold">이용권</h2>
          {membership ? (
            <Info label={PASS_LABELS[membership.type]} value={`${fmtEventDate(membershipEnd(membership)!)}까지 횟수 제한 없이 신청`} />
          ) : (
            <p className="text-sm text-stone-600">보유한 멤버십이 없어요. 1회권은 신청할 때마다 결제해요.</p>
          )}
        </Card>

        <Link href="/profile/edit" className={btnPrimary}>회원 정보 수정</Link>
        <form action={signOut} className="text-center">
          <button className="min-h-11 text-sm text-stone-600 underline">로그아웃</button>
        </form>
      </div>
      <BottomNav current="me" />
    </Screen>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2 text-sm">
      <span className="text-stone-600">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Tags({ label, items }: { label: string; items: string[] | null }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2 text-sm">
      <span className="pt-1 text-stone-600">{label}</span>
      {items && items.length > 0 ? (
        <span className="flex flex-wrap gap-1.5">
          {items.map((t) => (
            <span key={t} className="rounded-full border-[1.5px] border-stone-400 px-2.5 py-0.5 text-[13px]">{t}</span>
          ))}
        </span>
      ) : <span className="pt-1">미입력</span>}
    </div>
  );
}
