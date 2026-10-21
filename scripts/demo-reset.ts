/**
 * 시연 데이터 초기화: 가상 참가자 291명과 테스트 계정이 "신청·결제 완료, 매칭 대기"인 시드 직후 상태로 되돌린다.
 *
 * 실행: npm run demo:reset -- --yes
 *
 * 남기는 것: 프로필·계정, 회차(전부 모집 중으로), 식당·수용 인원(예약 가능으로), 시드 신청·이용권·결제, 매칭 설정
 * 지우는 것: 매칭 실행·테이블·단체방·메시지, 실패 해결, 피드백·사람별 선호·차단·신고, 예외, 알림, 상태 이력,
 *           시연 중 테스트 계정으로 새로 만든 신청(가상 참가자와 연결되지 않은 계정의 신청)
 * 되돌리는 것: 시드 신청의 상태(SUBMITTED·PAID·WAITING), 결제(PAID), 이용권(보관·연장 없음), 이용 제한(없음),
 *             실패 해결로 옮겨 붙은 회차(시드 날짜 순서에서 건너뛴 날짜)
 */
import { createClient } from "@supabase/supabase-js";

if (!process.argv.includes("--yes")) {
  console.log("시연 데이터를 시드 직후 상태로 되돌립니다. 정말 실행하려면: npm run demo:reset -- --yes");
  process.exit(0);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error(".env.local에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const ALL = "00000000-0000-0000-0000-000000000000";

async function step(what: string, p: PromiseLike<{ error: { message: string } | null; count?: number | null }>) {
  const { error, count } = await p;
  if (error) throw new Error(`${what} 실패: ${error.message}`);
  console.log(`✓ ${what}${count != null ? ` (${count})` : ""}`);
}
async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await q(f, f + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
const chunk = <T,>(xs: T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

async function main() {
  // 1. 매칭·모임 결과와 기록 삭제 (외래 키 순서)
  await step("피드백 삭제", db.from("feedbacks").delete({ count: "exact" }).neq("id", ALL));
  await step("사람별 선호 삭제", db.from("person_preferences").delete({ count: "exact" }).neq("id", ALL));
  await step("신고 삭제", db.from("safety_reports").delete({ count: "exact" }).neq("id", ALL));
  await step("차단 삭제", db.from("user_blocks").delete({ count: "exact" }).neq("blocker", ALL));
  await step("예외 삭제", db.from("exception_cases").delete({ count: "exact" }).neq("id", ALL));
  await step("실패 해결 삭제", db.from("match_resolutions").delete({ count: "exact" }).neq("id", ALL));
  await step("알림 삭제", db.from("notifications").delete({ count: "exact" }).neq("id", ALL));
  await step("상태 이력 삭제", db.from("status_history").delete({ count: "exact" }).gte("id", 0));
  await step("테이블·구성원·단체방·메시지 삭제", db.from("dining_tables").delete({ count: "exact" }).neq("id", ALL));
  await step("매칭 실행 기록 삭제", db.from("match_runs").delete({ count: "exact" }).neq("id", ALL));

  // 2. 시연 중 새로 만든 신청 삭제 (가상 참가자와 연결되지 않은 프로필)
  const profiles = await all<{ id: string; seed_key: string | null; role: string }>((f, t) => db.from("profiles").select("id, seed_key, role").range(f, t));
  const nonSeed = profiles.filter((p) => !p.seed_key).map((p) => p.id);
  for (const ids of chunk(nonSeed)) {
    await step("테스트 계정 신청 삭제", db.from("applications").delete({ count: "exact" }).in("profile_id", ids));
    await step("테스트 계정 이용권 삭제", db.from("passes").delete({ count: "exact" }).in("profile_id", ids));
  }

  // 가상 참가자는 시드 때 만든 첫 신청만 남긴다 (재참여 시뮬레이션 등으로 생긴 신청 삭제)
  const seedApps = await all<{ id: string; profile_id: string; created_at: string }>((f, t) => db.from("applications").select("id, profile_id, created_at").order("created_at").range(f, t));
  const firstOf = new Map<string, string>();
  const extra: string[] = [];
  for (const a of seedApps) { if (firstOf.has(a.profile_id)) extra.push(a.id); else firstOf.set(a.profile_id, a.id); }
  for (const ids of chunk(extra)) await step("시드 이후 추가 신청 삭제", db.from("applications").delete({ count: "exact" }).in("id", ids));
  const usedPasses = new Set((await all<{ pass_id: string | null }>((f, t) => db.from("applications").select("pass_id").range(f, t))).map((a) => a.pass_id));
  const passes = await all<{ id: string }>((f, t) => db.from("passes").select("id").range(f, t));
  for (const ids of chunk(passes.map((p) => p.id).filter((id) => !usedPasses.has(id)))) await step("쓰지 않는 이용권 삭제", db.from("passes").delete({ count: "exact" }).in("id", ids));

  // 3. 시드 신청 상태 되돌리기
  await step("신청 상태 되돌리기", db.from("applications").update({
    application_status: "SUBMITTED", payment_status: "PAID", match_status: "WAITING", attendance_status: null,
    placement_reason: null, reallocation_count: 0, confirmed_slot_id: null,
  }, { count: "exact" }).neq("id", ALL));
  await step("결제 되돌리기", db.from("payments").update({ status: "PAID", refunded_amount: null, refunded_at: null }, { count: "exact" }).neq("id", ALL));
  await step("이용권 되돌리기", db.from("passes").update({ stored: false, extension_weeks: 0 }, { count: "exact" }).neq("id", ALL));
  await step("이용 제한 해제", db.from("profiles").update({ restriction_level: 0, restricted_until: null }, { count: "exact" }).neq("id", ALL));

  // 4. 실패 해결로 옮겨 붙은 회차 제거: 시드 신청은 첫 시드 날짜부터 연속된 날짜를 고른다 (건너뛴 뒤 날짜나 시드 이후 회차는 이동으로 붙은 것)
  const slots = await all<{ id: string; event_date: string }>((f, t) => db.from("event_slots").select("id, event_date").order("event_date").range(f, t));
  const seedDates = [...new Set(slots.map((s) => s.event_date))].slice(0, 3);
  const dateOf = new Map(slots.map((s) => [s.id, s.event_date]));
  const links = await all<{ application_id: string; slot_id: string }>((f, t) => db.from("application_slots").select("application_id, slot_id").range(f, t));
  const byApp = new Map<string, { slot_id: string; date: string }[]>();
  links.forEach((l) => byApp.set(l.application_id, [...(byApp.get(l.application_id) ?? []), { slot_id: l.slot_id, date: dateOf.get(l.slot_id) ?? "" }]));
  let removed = 0;
  for (const [appId, ls] of byApp) {
    const dates = new Set(ls.map((l) => l.date));
    let keep = 0;
    while (keep < seedDates.length && dates.has(seedDates[keep])) keep++;
    const ok = new Set(seedDates.slice(0, keep));
    for (const l of ls.filter((x) => !ok.has(x.date))) {
      const { error } = await db.from("application_slots").delete().eq("application_id", appId).eq("slot_id", l.slot_id);
      if (error) throw new Error(error.message);
      removed++;
    }
  }
  console.log(`✓ 이동으로 붙은 회차 제거 (${removed})`);

  // 5. 회차·식당 되돌리기
  await step("회차 모집 중으로", db.from("event_slots").update({ status: "OPEN" }, { count: "exact" }).neq("id", ALL));
  await step("식당 예약 가능으로", db.from("venue_availability").update({ reservation_status: "AVAILABLE" }, { count: "exact" }).eq("reservation_status", "RESERVED"));

  const { count } = await db.from("applications").select("*", { count: "exact", head: true }).eq("match_status", "WAITING");
  console.log(`\n완료: 매칭 대기 신청 ${count}건. 운영 대시보드에서 "지금 매칭 실행"부터 시연할 수 있어요.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
