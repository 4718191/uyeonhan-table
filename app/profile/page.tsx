import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { BottomNav, Screen, TopBar } from "@/components/mobile";
import { ProfileForm } from "./ProfileForm";
import type { ProfileValues } from "./actions";

// P-2 프로필·매칭 선호. 처음이면 신청 1단계, 이미 있으면 "내 정보" 수정 화면.
export default async function ProfilePage() {
  const { profile } = await requireProfile();
  if (profile?.role === "admin") redirect("/admin");
  const onboarding = !profile;

  const initial: ProfileValues = {
    name: profile?.name ?? "",
    phone: profile?.phone ?? "",
    birth_year: profile?.birth_year ? String(profile.birth_year) : "",
    gender: profile?.gender ?? "",
    job: profile?.job ?? "",
    mbti: profile?.mbti ?? "",
    interests: profile?.interests ?? [],
    self_traits: profile?.self_traits ?? [],
    wanted_traits: profile?.wanted_traits ?? [],
    price_ranges: profile?.price_ranges ?? [],
    food_restrictions: profile?.food_restrictions ?? "",
    consent_privacy: !!profile?.consented_at,
    consent_policy: !!profile?.consented_at,
  };

  return (
    <Screen>
      <TopBar title={onboarding ? "프로필 작성" : "내 정보"} back={onboarding ? undefined : "/home"} step={onboarding ? "1 / 3" : undefined} />
      <div className="flex flex-col gap-4 px-4 py-5">
        <p className="text-sm text-stone-600">
          매칭에 쓰이는 정보예요. 다른 참가자에게는 매칭이 확정된 뒤 이름과 관심사·성향만 보여요.
        </p>
        <ProfileForm initial={initial} onboarding={onboarding} />
        {!onboarding && (
          <form action={signOut} className="pb-4 text-center">
            <button className="min-h-11 text-sm text-stone-600 underline">로그아웃</button>
          </form>
        )}
      </div>
      {!onboarding && <BottomNav current="me" />}
    </Screen>
  );
}
