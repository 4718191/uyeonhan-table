import { requireAdmin } from "@/lib/auth";
import { Panel } from "@/components/admin";
import { JobButtons } from "./JobButtons";

export const maxDuration = 60;

// A-1 운영 대시보드 (10/21 지표 구현 예정). 지금은 기본 숫자와 시연 도구.
export default async function AdminPage() {
  const { supabase } = await requireAdmin();
  const [{ count: profiles }, { count: slots }, { count: venues }, { count: paid }] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("event_slots").select("*", { count: "exact", head: true }),
    supabase.from("venues").select("*", { count: "exact", head: true }),
    supabase.from("applications").select("*", { count: "exact", head: true })
      .eq("payment_status", "PAID").eq("application_status", "SUBMITTED"),
  ]);
  const stats = [
    { label: "프로필", value: profiles },
    { label: "회차", value: slots },
    { label: "식당", value: venues },
    { label: "결제 완료 신청", value: paid },
  ];
  return (
    <>
      <h1 className="text-2xl font-bold">운영 대시보드</h1>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border-[1.5px] border-stone-400 bg-white p-4">
            <p className="text-sm text-stone-600">{s.label}</p>
            <p className="text-2xl font-bold">{s.value ?? 0}</p>
          </div>
        ))}
      </section>
      <Panel title="시연 도구">
        <p className="text-sm text-stone-600">실제 운영에서 예약 실행되는 작업을 지금 바로 실행해요.</p>
        <JobButtons />
      </Panel>
    </>
  );
}
