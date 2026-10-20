import Link from "next/link";
import { requireParticipant } from "@/lib/auth";
import { getApplications, hasChat, isOngoing } from "@/lib/applications";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { MATCH_LABELS } from "@/lib/labels";
import { fmtDeadline, fmtEventDate, fmtTime } from "@/lib/time";
import { BottomNav, Card, Screen, TopBar, btnPrimary } from "@/components/mobile";

const ATTEND: Record<string, string> = { SCHEDULED: "참석 예정", ATTENDED: "참석 완료", CANCELED_EARLY: "사전 취소", CANCELED_LATE: "확정 후 취소", NO_SHOW: "노쇼" };

// RET-01 참가 이력 + RET-02 다음 일정 추천
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ feedback?: string }> }) {
  const { feedback } = await searchParams;
  const { supabase, profile } = await requireParticipant();
  const apps = await getApplications(supabase, profile.id);
  const db = createAdminClient();

  // 확정된 신청의 테이블과 피드백 제출 여부 (본인 신청만 위에서 읽었으므로 서버에서 조회)
  const confirmedIds = apps.filter((a) => a.confirmed_slot_id).map((a) => a.id);
  const { data: members } = confirmedIds.length
    ? await db.from("table_members").select("application_id, table_id, dining_tables(table_no, status)").in("application_id", confirmedIds).order("joined_at", { ascending: false })
    : { data: [] };
  const tableOf = new Map<string, { id: string; no: number | null }>();
  for (const m of members ?? []) if (!tableOf.has(m.application_id)) {
    const t = (Array.isArray(m.dining_tables) ? m.dining_tables[0] : m.dining_tables) as { table_no: number | null } | null;
    tableOf.set(m.application_id, { id: m.table_id, no: t?.table_no ?? null });
  }
  const { data: fbs } = await supabase.from("feedbacks").select("table_id").eq("profile_id", profile.id);
  const fbDone = new Set((fbs ?? []).map((f) => f.table_id));

  // 다음 일정 추천: 자주 고른 지역의 아직 신청하지 않은 모집 회차부터
  const regionCount = new Map<string, number>();
  apps.forEach((a) => {
    const s = a.slots.find((x) => x.id === a.confirmed_slot_id);
    (s ? [s] : a.slots).forEach((x) => regionCount.set(x.region, (regionCount.get(x.region) ?? 0) + (s ? 2 : 1)));
  });
  const applied = new Set(apps.flatMap((a) => a.slots.map((s) => s.id)));
  const { data: open } = await db.from("event_slots").select("id, event_date, start_time, region, apply_deadline").eq("status", "OPEN").gt("apply_deadline", new Date().toISOString()).order("event_date").limit(40);
  const recs = (open ?? []).filter((s) => !applied.has(s.id))
    .sort((a, b) => (regionCount.get(b.region) ?? 0) - (regionCount.get(a.region) ?? 0) || a.event_date.localeCompare(b.event_date))
    .slice(0, 3);
  const top = [...regionCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const ongoing = isOngoing(apps[0] ?? null);

  return (
    <Screen>
      <TopBar title="참가 이력" />
      <div className="flex flex-col gap-4 px-4 py-5">
        {feedback && <p role="status" className="text-sm font-semibold">피드백을 보냈어요. 다음 매칭에 반영돼요.</p>}

        <Card>
          <h2 className="text-base font-bold">지난 신청</h2>
          {apps.length === 0 ? <p className="text-sm text-stone-600">아직 신청 내역이 없어요.</p> : (
            <ul className="flex flex-col">
              {apps.map((a) => {
                const s = a.slots.find((x) => x.id === a.confirmed_slot_id);
                const t = tableOf.get(a.id);
                const status = a.application_status === "CANCELED" && a.attendance_status !== "CANCELED_LATE" ? "신청 취소"
                  : a.attendance_status ? ATTEND[a.attendance_status] : MATCH_LABELS[a.match_status];
                return (
                  <li key={a.id} className="flex flex-col gap-1 border-t border-stone-200 py-3 first:border-t-0 first:pt-0">
                    <span className="font-semibold">
                      {s ? `${fmtEventDate(s.event_date)} ${fmtTime(s.start_time)} · ${REGIONS[s.region as RegionCode]}${t?.no ? ` ${t.no}번 테이블` : ""}`
                        : `${[...new Set(a.slots.map((x) => fmtEventDate(x.event_date)))].join(", ")} · ${[...new Set(a.slots.map((x) => REGIONS[x.region as RegionCode]))].join(", ")}`}
                    </span>
                    <span className="text-sm text-stone-600">
                      {status}
                      {a.attendance_status === "ATTENDED" && t && (fbDone.has(t.id) ? " · 피드백 제출 완료" : " · 피드백 미제출")}
                    </span>
                    {a.attendance_status === "ATTENDED" && t && !fbDone.has(t.id) && hasChat(a) && (
                      <Link href="/feedback" className="text-sm font-semibold underline">피드백 남기기</Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-base font-bold">다음 모임 추천</h2>
          <p className="text-xs text-stone-600">{top ? `자주 고르신 ${REGIONS[top as RegionCode]} 지역 일정부터 보여 드려요.` : "가까운 모집 일정이에요."}</p>
          {recs.length === 0 ? <p className="text-sm text-stone-600">지금 신청할 수 있는 모집 일정이 없어요.</p> : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {recs.map((r) => (
                <li key={r.id} className="flex justify-between gap-2">
                  <span className="font-semibold">{fmtEventDate(r.event_date)} {fmtTime(r.start_time)} · {REGIONS[r.region as RegionCode]}</span>
                  <span className="text-xs text-stone-600">{fmtDeadline(r.apply_deadline)} 마감</span>
                </li>
              ))}
            </ul>
          )}
          {!ongoing && recs.length > 0 && <Link href="/apply" className={btnPrimary}>다음 모임 신청하기</Link>}
          {ongoing && <p className="text-xs text-stone-600">진행 중인 신청이 끝나면 다음 모임을 신청할 수 있어요.</p>}
        </Card>
      </div>
      <BottomNav current="history" chatHref={hasChat(apps[0] ?? null) ? "/chat" : undefined} />
    </Screen>
  );
}
