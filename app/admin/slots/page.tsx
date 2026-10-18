import { requireAdmin } from "@/lib/auth";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { addDays, fmtDeadline, fmtEventDate, fmtTime, todayKST } from "@/lib/time";
import { Badge, Panel, btnLineCls, tableCls } from "@/components/admin";
import { CreateSlotForm } from "./CreateSlotForm";
import { toggleSlot } from "./actions";

const STATUS: Record<string, { label: string; tone: "solid" | "line" | "muted" }> = {
  OPEN: { label: "모집 중", tone: "line" },
  MATCHING: { label: "매칭 중", tone: "solid" },
  MATCHED: { label: "매칭 완료", tone: "solid" },
  CLOSED: { label: "모집 마감", tone: "muted" },
};

// A-2 회차 생성·관리
export default async function SlotsPage() {
  const { supabase } = await requireAdmin();
  const [{ data: slots }, { data: cands }] = await Promise.all([
    supabase.from("event_slots")
      .select("id, event_date, start_time, region, capacity, apply_deadline, match_at, status")
      .order("event_date").order("start_time").order("region"),
    supabase.from("application_slots").select("slot_id, applications(application_status, payment_status)"),
  ]);

  // 회차별 신청(취소 제외)·결제 완료 수
  const counts = new Map<string, { applied: number; paid: number }>();
  for (const c of cands ?? []) {
    const a = Array.isArray(c.applications) ? c.applications[0] : c.applications;
    if (!a || a.application_status !== "SUBMITTED") continue;
    const cur = counts.get(c.slot_id) ?? { applied: 0, paid: 0 };
    cur.applied += 1;
    if (a.payment_status === "PAID") cur.paid += 1;
    counts.set(c.slot_id, cur);
  }
  const now = Date.now();

  return (
    <>
      <h1 className="text-2xl font-bold">회차 생성·관리</h1>
      <div className="grid gap-6 2xl:grid-cols-[1fr_360px]">
        <Panel title="회차 목록" aside={<span className="text-xs text-stone-600">신청 수는 한 사람이 여러 회차를 후보로 고른 경우 각각 셉니다</span>}>
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead>
                <tr><th>날짜·시간</th><th>지역</th><th>정원</th><th>신청 마감·자동 매칭</th><th>후보 신청 · 결제 완료</th><th>상태</th><th></th></tr>
              </thead>
              <tbody>
                {(slots ?? []).map((s) => {
                  const c = counts.get(s.id) ?? { applied: 0, paid: 0 };
                  const st = STATUS[s.status] ?? { label: s.status, tone: "line" as const };
                  const passed = new Date(s.apply_deadline).getTime() <= now;
                  return (
                    <tr key={s.id}>
                      <td className="whitespace-nowrap font-semibold">{fmtEventDate(s.event_date)} {fmtTime(s.start_time)}</td>
                      <td className="whitespace-nowrap">{REGIONS[s.region as RegionCode]}</td>
                      <td className="whitespace-nowrap">{s.capacity}명</td>
                      <td className="whitespace-nowrap">
                        {fmtDeadline(s.apply_deadline)}
                        {s.match_at !== s.apply_deadline && <span className="block text-xs text-stone-600">매칭 {fmtDeadline(s.match_at)}</span>}
                        {passed && <span className="block text-xs text-stone-600">마감 지남</span>}
                      </td>
                      <td className="whitespace-nowrap">{c.applied} · {c.paid}</td>
                      <td><Badge tone={st.tone}>{st.label}</Badge></td>
                      <td>
                        {(s.status === "OPEN" || s.status === "CLOSED") && !passed && (
                          <form action={toggleSlot}>
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="to" value={s.status === "OPEN" ? "CLOSED" : "OPEN"} />
                            <button className={btnLineCls}>{s.status === "OPEN" ? "모집 마감" : "다시 열기"}</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="새 회차 만들기">
          <CreateSlotForm defaultDate={addDays(todayKST(), 14)} />
        </Panel>
      </div>
    </>
  );
}
