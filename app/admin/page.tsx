import { requireAdmin } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { JobButtons } from "./JobButtons";

// A-1 운영 대시보드 (10/21 지표 구현 예정). 지금은 연결 확인과 시연 도구.
export default async function AdminPage() {
  const { supabase } = await requireAdmin();
  const [{ count: profiles }, { count: slots }, { count: venues }, { count: paid }] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("event_slots").select("*", { count: "exact", head: true }),
    supabase.from("venues").select("*", { count: "exact", head: true }),
    supabase.from("applications").select("*", { count: "exact", head: true }).eq("payment_status", "PAID"),
  ]);
  const stats = [
    { label: "프로필", value: profiles },
    { label: "회차", value: slots },
    { label: "식당", value: venues },
    { label: "결제 완료 신청", value: paid },
  ];
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">운영 대시보드</h1>
        <form action={signOut}><button className="text-sm underline">로그아웃</button></form>
      </div>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-stone-400 bg-white p-4">
            <p className="text-sm text-stone-600">{s.label}</p>
            <p className="text-2xl font-bold">{s.value ?? 0}</p>
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-3 rounded-xl border border-stone-400 bg-white p-4">
        <h2 className="font-bold">시연 도구</h2>
        <p className="text-sm text-stone-600">실제 운영에서 예약 실행되는 작업을 지금 바로 실행해요.</p>
        <JobButtons />
      </section>
    </main>
  );
}
