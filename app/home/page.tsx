import { requireProfile } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

// P-5 홈·신청 상태 (10/18 구현 예정). 지금은 연결 확인용.
export default async function HomePage() {
  const { supabase, profile } = await requireProfile();
  const { data: apps } = profile
    ? await supabase
        .from("applications")
        .select("id, application_status, payment_status, match_status")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(1)
    : { data: [] };
  const app = apps?.[0];
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-bold">{profile?.name ?? "참가자"}님의 신청 현황</h1>
      <section className="rounded-xl border border-stone-400 bg-white p-4">
        {app ? (
          <dl className="grid grid-cols-[80px_1fr] gap-y-2 text-sm">
            <dt className="text-stone-600">신청</dt><dd>{app.application_status}</dd>
            <dt className="text-stone-600">결제</dt><dd>{app.payment_status}</dd>
            <dt className="text-stone-600">매칭</dt><dd>{app.match_status}</dd>
          </dl>
        ) : (
          <p className="text-sm text-stone-600">아직 신청 내역이 없어요.</p>
        )}
      </section>
      <form action={signOut}><button className="text-sm underline">로그아웃</button></form>
    </main>
  );
}
