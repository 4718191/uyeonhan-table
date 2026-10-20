import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { fmtDeadline, fmtEventDate, fmtTime } from "@/lib/time";
import { mapLink } from "@/lib/map";
import { planBatch, type PlannedTable } from "./plan";
import { MAX_AGE_GAP, MAX_SIZE, MIN_SIZE, applyMutualWantAgain, pairKey, type Person, type Relations, type Weights } from "./score";

// 자동 매칭 실행 (PRD 7장, MVP 3·5장). Vercel Cron(마감 시각)과 운영자 "지금 실행" 버튼이 같은 함수를 쓴다.
// 같은 마감 시각(match_at)은 한 번만 실행된다: match_runs.run_key 유일 키 (중복 테이블·중복 단체방 방지, PRD 7.3).

export const ALGORITHM_VERSION = "greedy-v1";
export type MatchResult = { ok: boolean; message: string; runId?: string };

type Slot = { id: string; event_date: string; start_time: string; region: string; capacity: number; match_at: string };
type Change = { entity: string; entity_id: string; field: string; from_value: string | null; to_value: string; actor: "SYSTEM"; reason: string };
type Note = { profile_id: string; template_key: string; title: string; body: string; link: string; sent_at: string; delivery_status: "SENT" };

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const slotLabel = (s: Slot) => `${fmtEventDate(s.event_date)} ${fmtTime(s.start_time)} ${REGIONS[s.region as RegionCode]}`;

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as NonNullable<T>;
}

/** 다음 매칭 대상 회차 묶음 (같은 match_at). CRON은 마감이 지난 것만, ADMIN(시연)은 가장 가까운 것을 지금 실행한다. */
async function nextBatch(db: SupabaseClient, trigger: "CRON" | "ADMIN") {
  let q = db.from("event_slots").select("match_at").eq("status", "OPEN").order("match_at").limit(1);
  if (trigger === "CRON") q = q.lte("match_at", new Date().toISOString());
  const first = await must(q, "회차 조회");
  if (!first || first.length === 0) return null;
  const matchAt = first[0].match_at as string;
  const slots = await must(
    db.from("event_slots").select("id, event_date, start_time, region, capacity, match_at").eq("status", "OPEN").eq("match_at", matchAt),
    "회차 조회",
  );
  return { matchAt, slots: slots as Slot[] };
}

export async function runMatching(trigger: "CRON" | "ADMIN"): Promise<MatchResult> {
  const db = createAdminClient();
  const batch = await nextBatch(db, trigger);
  if (!batch) return { ok: true, message: trigger === "CRON" ? "마감 시각이 지난 매칭 대기 회차가 없어요." : "매칭을 기다리는 회차가 없어요." };
  const { matchAt, slots } = batch;
  const slotIds = slots.map((s) => s.id);
  const slotById = new Map(slots.map((s) => [s.id, s]));

  const { data: settings } = await db.from("matching_settings").select("*").eq("scope", "GLOBAL").single();
  if (!settings) return { ok: false, message: "기본 매칭 설정이 없어요." };
  const weights: Weights = {
    w_age: settings.w_age, w_gender: settings.w_gender, w_mbti: settings.w_mbti, w_interest: settings.w_interest,
    w_wanted: settings.w_wanted, w_new_people: settings.w_new_people, min_score: settings.min_score,
  };

  // 멱등: 같은 마감 시각 매칭은 한 번만
  const { data: run, error: runErr } = await db
    .from("match_runs")
    .insert({ run_key: `match:${matchAt}`, match_at: matchAt, algorithm_version: ALGORITHM_VERSION, settings_snapshot: weights, triggered_by: trigger, slot_ids: slotIds })
    .select("id")
    .single();
  if (runErr) {
    if (runErr.code === "23505") return { ok: true, message: "이 회차는 이미 매칭을 실행했어요. 같은 매칭은 두 번 실행되지 않아요." };
    return { ok: false, message: `매칭 실행 기록을 만들지 못했어요: ${runErr.message}` };
  }
  await db.from("event_slots").update({ status: "MATCHING" }).in("id", slotIds);

  try {
    const summary = await execute(db, run.id, matchAt, slots, slotById, weights);
    await db.from("event_slots").update({ status: "MATCHED" }).in("id", slotIds);
    const dateLabel = fmtEventDate(slots[0].event_date);
    return {
      ok: true,
      runId: run.id,
      message: `${dateLabel} 매칭 완료: 후보 ${summary.candidates}명 → 테이블 ${summary.tables}개 확정(${summary.confirmed}명), 다른 날짜로 재배치 ${summary.reallocated}명, 매칭 실패 ${summary.failed}명${summary.exceptions ? `, 운영 확인 ${summary.exceptions}건` : ""}.`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("match_runs").update({ finished_at: new Date().toISOString(), failure_summary: { error: msg } }).eq("id", run.id);
    await db.from("exception_cases").insert({ type: "DATA_MISSING", reason: `자동 매칭 실행 중 오류: ${msg}` });
    return { ok: false, message: `매칭 중 오류가 나서 운영자 예외로 올렸어요: ${msg}` };
  }
}

async function execute(
  db: SupabaseClient, runId: string, matchAt: string, slots: Slot[], slotById: Map<string, Slot>, weights: Weights,
) {
  const slotIds = slots.map((s) => s.id);
  const now = new Date().toISOString();

  // ── 1. 후보: 이번 회차를 고른 신청 중 결제 완료·매칭 대기(또는 재배치 중) ──
  const links = await must(db.from("application_slots").select("application_id").in("slot_id", slotIds), "후보 조회");
  const appIds = [...new Set((links as { application_id: string }[]).map((l) => l.application_id))];
  type AppRow = {
    id: string; profile_id: string; application_status: string; payment_status: string; match_status: string; reallocation_count: number;
    placement_reason: string | null; passes: unknown; profiles: unknown; application_slots: { slot_id: string; event_slots: unknown }[];
  };
  const apps: AppRow[] = [];
  for (const ids of chunk(appIds, 80)) {
    const rows = await must(
      db.from("applications")
        .select("id, profile_id, application_status, payment_status, match_status, reallocation_count, placement_reason, passes(type), profiles(id, name, birth_year, gender, mbti, interests, self_traits, wanted_traits), application_slots(slot_id, event_slots(id, event_date, start_time, region, capacity, match_at, status))")
        .in("id", ids),
      "신청 조회",
    );
    apps.push(...(rows as AppRow[]));
  }
  const active = apps.filter((a) => a.application_status === "SUBMITTED" && ["WAITING", "REALLOCATING", "TRANSFERRED"].includes(a.match_status));
  const unpaidApps = active.filter((a) => a.payment_status !== "PAID"); // 결제 안 한 신청은 후보에서 제외 (PRD 15장)
  const unpaid = unpaidApps.length;
  const paid = active.filter((a) => a.payment_status === "PAID");

  // 이번 묶음 다음에 매칭할 열린 회차 (재배치·대체 일정 추천·결제 기한 안내에 쓴다)
  const { data: openLater } = await db.from("event_slots").select("id, event_date, start_time, region, capacity, match_at")
    .eq("status", "OPEN").gt("match_at", matchAt).order("match_at");
  const later = (openLater ?? []) as Slot[];
  const mySlots = (a: AppRow) => a.application_slots.map((s) => one(s.event_slots as Slot | null)).filter((s): s is Slot => !!s);

  const changes: Change[] = [];
  const notes: Note[] = [];
  const exceptions: Record<string, unknown>[] = [];
  const setStatus = (a: AppRow, to: string, reason: string) =>
    changes.push({ entity: "application", entity_id: a.id, field: "match_status", from_value: a.match_status, to_value: to, actor: "SYSTEM", reason });
  const notify = (a: AppRow, key: string, title: string, body: string, link: string) =>
    notes.push({ profile_id: a.profile_id, template_key: key, title, body, link, sent_at: now, delivery_status: "SENT" });

  // 결제 미완료: 매칭 후보에서 빼고 결제 기한을 안내한다 (PRD 15장)
  for (const a of unpaidApps) {
    const next = mySlots(a).filter((s) => later.some((l) => l.id === s.id)).sort((x, y) => x.match_at.localeCompare(y.match_at))[0];
    notify(a, "MATCH_UNPAID", "결제가 완료되지 않아 이번 매칭에서 빠졌어요",
      next
        ? `${fmtEventDate(slots[0].event_date)} 회차 결제 기한(${fmtDeadline(matchAt)})이 지났어요. ${fmtDeadline(next.match_at)}까지 결제하면 신청한 ${fmtEventDate(next.event_date)} 회차 매칭에 참여할 수 있어요.`
        : `${fmtEventDate(slots[0].event_date)} 회차 결제 기한(${fmtDeadline(matchAt)})이 지났어요. 다른 회차로 다시 신청해 주세요.`,
      next ? `/apply/${a.id}/pay` : "/apply");
  }

  // 매칭에 꼭 필요한 정보가 없으면 운영자 예외 (PRD 15장 데이터 누락)
  const people: Person[] = [];
  const appById = new Map<string, AppRow>();
  for (const a of paid) {
    const p = one(a.profiles as Record<string, unknown> | null) as {
      id: string; name: string; birth_year: number | null; gender: "F" | "M" | null; mbti: string | null;
      interests: string[] | null; self_traits: string[] | null; wanted_traits: string[] | null;
    } | null;
    appById.set(a.id, a);
    if (!p || !p.birth_year || !p.gender) {
      exceptions.push({ type: "DATA_MISSING", application_id: a.id, reason: "출생연도·성별이 없어 매칭 조건을 확인할 수 없음" });
      setStatus(a, "EXCEPTION", "데이터 누락");
      continue;
    }
    people.push({
      appId: a.id, profileId: p.id, name: p.name, birthYear: p.birth_year, gender: p.gender, mbti: p.mbti,
      interests: p.interests ?? [], selfTraits: p.self_traits ?? [], wantedTraits: p.wanted_traits ?? [],
      slotIds: a.application_slots.map((s) => s.slot_id).filter((id) => slotById.has(id)),
    });
  }

  // ── 2. 관계: 차단·신고·비선호는 같은 테이블 불가, 이전에 만난 사람은 점수에만 반영 ──
  const rel: Relations = { blocked: new Set(), met: new Set() };
  const [blocks, avoids, reports, pastMembers] = await Promise.all([
    must(db.from("user_blocks").select("blocker, blocked"), "차단 조회"),
    must(db.from("person_preferences").select("from_profile, to_profile").eq("kind", "AVOID"), "비선호 조회"),
    must(db.from("safety_reports").select("reporter, reported"), "신고 조회"),
    must(db.from("table_members").select("table_id, applications(profile_id), dining_tables(status)"), "이전 테이블 조회"),
  ]);
  (blocks as { blocker: string; blocked: string }[]).forEach((r) => rel.blocked.add(pairKey(r.blocker, r.blocked)));
  (avoids as { from_profile: string; to_profile: string }[]).forEach((r) => rel.blocked.add(pairKey(r.from_profile, r.to_profile)));
  (reports as { reporter: string; reported: string }[]).forEach((r) => rel.blocked.add(pairKey(r.reporter, r.reported)));
  const byTable = new Map<string, string[]>();
  for (const m of pastMembers as { table_id: string; applications: unknown; dining_tables: unknown }[]) {
    const app = one(m.applications as { profile_id: string } | null);
    const t = one(m.dining_tables as { status: string } | null);
    if (!app || t?.status !== "CONFIRMED") continue;
    byTable.set(m.table_id, [...(byTable.get(m.table_id) ?? []), app.profile_id]);
  }
  for (const ids of byTable.values()) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) rel.met.add(pairKey(ids[i], ids[j]));
  // 서로 "또 만나고 싶어요"를 고른 사이는 이전 만남 감점을 하지 않는다 (FDB-04 → 다음 매칭 반영)
  const { data: wants } = await db.from("person_preferences").select("from_profile, to_profile").eq("kind", "WANT_AGAIN");
  const metBefore = new Set(rel.met);
  applyMutualWantAgain(rel.met, (wants ?? []) as { from_profile: string; to_profile: string }[]);

  // 18장 완료 조건 11 확인용: 이번 후보들 사이에서 관계·피드백이 몇 쌍 반영됐는지 센다
  const cand = new Set(people.map((p) => p.profileId));
  const inCand = (k: string) => { const [a, b] = k.split("|"); return cand.has(a) && cand.has(b); };
  const relationSummary = {
    blocked: [...rel.blocked].filter(inCand).length,                                   // 차단·신고·비선호 → 같은 테이블 제외
    met: [...rel.met].filter(inCand).length,                                           // 이전 만남 → 새로운 사람 점수 감점
    wantAgain: [...metBefore].filter((k) => inCand(k) && !rel.met.has(k)).length,     // 서로 또 만나고 싶음 → 감점 제외
  };

  // ── 3. 테이블 구성 ──
  const plan = planBatch(people, slots.map((s) => ({ id: s.id, capacity: s.capacity })), weights, rel);

  // ── 3-1. 확정 전 재검증 (MAT-09): 인원·나이 차·차단·신고·비선호를 다시 확인한다. 어긋나면 확정하지 않고 예외로 보낸다 ──
  const verify = (t: PlannedTable) => {
    const ys = t.members.map((m) => m.birthYear);
    let conflicts = 0;
    let metPairs = 0;
    for (let i = 0; i < t.members.length; i++) for (let j = i + 1; j < t.members.length; j++) {
      const k = pairKey(t.members[i].profileId, t.members[j].profileId);
      if (rel.blocked.has(k)) conflicts++;
      if (rel.met.has(k)) metPairs++;
    }
    const ageGap = Math.max(...ys) - Math.min(...ys);
    const ok = conflicts === 0 && ageGap <= MAX_AGE_GAP && t.members.length >= MIN_SIZE && t.members.length <= MAX_SIZE && t.total >= weights.min_score;
    return { ok, conflicts, metPairs, ageGap };
  };

  // ── 4. 식당 배정: 지역·날짜·시간이 맞고 예약 가능한 식당 중 평점 높은 곳부터, 남은 좌석에 테이블을 채운다 ──
  type Avail = { id: string; capacity: number; reservation_status: string; used: number; venue: { name: string; address: string | null; map_url: string | null; price_range: string | null; rating: number | null } };
  const availBySlot = new Map<string, Avail[]>();
  for (const s of slots) {
    const rows = await must(
      db.from("venue_availability")
        .select("id, capacity, reservation_status, venues!inner(name, region, address, map_url, price_range, rating)")
        .eq("slot_date", s.event_date).eq("start_time", s.start_time).eq("venues.region", s.region).neq("reservation_status", "CLOSED"),
      "식당 조회",
    );
    const list = (rows as { id: string; capacity: number; reservation_status: string; venues: unknown }[]).map((r) => ({
      id: r.id, capacity: r.capacity, reservation_status: r.reservation_status, used: 0,
      venue: one(r.venues as Avail["venue"])!,
    }));
    if (list.length) {
      const used = await must(db.from("dining_tables").select("venue_availability_id, size").in("venue_availability_id", list.map((l) => l.id)).eq("status", "CONFIRMED"), "좌석 조회");
      for (const u of used as { venue_availability_id: string; size: number }[]) {
        const a = list.find((l) => l.id === u.venue_availability_id);
        if (a) a.used += u.size;
      }
    }
    list.sort((a, b) => (b.venue.rating ?? 0) - (a.venue.rating ?? 0));
    availBySlot.set(s.id, list);
  }
  const { data: maxNo } = await db.from("dining_tables").select("slot_id, table_no").in("slot_id", slotIds);
  const nextNo = new Map<string, number>();
  for (const r of (maxNo ?? []) as { slot_id: string; table_no: number | null }[]) nextNo.set(r.slot_id, Math.max(nextNo.get(r.slot_id) ?? 0, r.table_no ?? 0));

  type Placed = PlannedTable & { id: string; no: number; avail: Avail | null; check: ReturnType<typeof verify> };
  const placed: Placed[] = [...plan.tables]
    .sort((a, b) => b.members.length - a.members.length)
    .map((t) => {
      const check = verify(t);
      const list = availBySlot.get(t.slotId) ?? [];
      const avail = check.ok ? (list.find((a) => a.capacity - a.used >= t.members.length) ?? null) : null;
      if (avail) avail.used += t.members.length;
      const no = (nextNo.get(t.slotId) ?? 0) + 1;
      nextNo.set(t.slotId, no);
      return { ...t, id: randomUUID(), no, avail, check };
    });

  // ── 5. 저장 ──
  const tableRows = placed.map((t) => ({
    id: t.id, match_run_id: runId, slot_id: t.slotId, size: t.members.length, table_no: t.no,
    scores: { ...t.parts, step: t.step, ageGap: t.check.ageGap, metPairs: t.check.metPairs, conflicts: t.check.conflicts, verified: t.check.ok }, total_score: t.total,
    status: t.avail ? "CONFIRMED" : "EXCEPTION", confirmed_at: t.avail ? now : null, venue_availability_id: t.avail?.id ?? null,
  }));
  for (const rows of chunk(tableRows, 100)) await must(db.from("dining_tables").insert(rows).select("id"), "테이블 저장");
  const memberRows = placed.flatMap((t) => t.members.map((m) => ({ table_id: t.id, application_id: m.appId })));
  for (const rows of chunk(memberRows, 300)) await must(db.from("table_members").insert(rows).select("id"), "테이블 구성원 저장");

  const confirmedTables = placed.filter((t) => t.avail);
  const rooms = confirmedTables.map((t) => ({ id: randomUUID(), table_id: t.id }));
  if (rooms.length) await must(db.from("chat_rooms").insert(rooms).select("id"), "단체방 생성");
  const roomByTable = new Map(rooms.map((r) => [r.table_id, r.id]));
  const notices = confirmedTables.map((t) => ({
    room_id: roomByTable.get(t.id)!, kind: "NOTICE", body: noticeText(slotById.get(t.slotId)!, t), delivery_status: "SENT",
  }));
  if (notices.length) await must(db.from("chat_messages").insert(notices).select("id"), "확정 안내 게시");

  // 확정된 사람
  const tableUpdates: (() => PromiseLike<unknown>)[] = [];
  for (const t of placed) {
    const slot = slotById.get(t.slotId)!;
    const ids = t.members.map((m) => m.appId);
    if (t.avail) {
      const base = `${t.step === 1 ? "같은 날짜·희망 지역에서 매칭" : "같은 날짜의 다른 희망 지역으로 재배치"} (점수 ${t.total})`;
      // 이전 회차에서 넘어온 사람은 재배치 경로를 사유에 남긴다 (7.2 최종 배치 사유)
      const reasonOf = (a: AppRow) => a.reallocation_count > 0 && a.placement_reason
        ? `${a.placement_reason.split(" → ")[0]} → ${fmtEventDate(slot.event_date)} 회차로 재배치되어 확정 · ${base}`
        : base;
      const fresh = ids.filter((id) => !(appById.get(id)!.reallocation_count > 0));
      if (fresh.length) tableUpdates.push(() => must(db.from("applications").update({ match_status: "CONFIRMED", confirmed_slot_id: t.slotId, attendance_status: "SCHEDULED", placement_reason: base }).in("id", fresh).select("id"), "확정 반영"));
      for (const id of ids.filter((id) => !fresh.includes(id))) {
        const a = appById.get(id)!;
        tableUpdates.push(() => must(db.from("applications").update({ match_status: "CONFIRMED", confirmed_slot_id: t.slotId, attendance_status: "SCHEDULED", placement_reason: reasonOf(a) }).eq("id", id).select("id"), "확정 반영"));
      }
      for (const m of t.members) {
        const a = appById.get(m.appId)!;
        const reason = reasonOf(a);
        setStatus(a, "CONFIRMED", reason);
        notify(a, "MATCH_CONFIRMED", "매칭이 확정됐어요",
          `${slotLabel(slot)} · ${t.avail.venue.name} · ${t.no}번 테이블. 단체방에서 함께할 분들을 확인해 보세요.`, "/table");
      }
    } else {
      const why = t.check.ok ? "배정 가능한 식당 없음" : "확정 전 재검증에서 조건 위반 발견";
      tableUpdates.push(() => must(db.from("applications").update({ match_status: "EXCEPTION", placement_reason: why }).in("id", ids).select("id"), "예외 반영"));
      exceptions.push(t.check.ok
        ? { type: "VENUE_SHORTAGE", table_id: t.id, reason: `${slotLabel(slot)} ${t.no}번 테이블(${t.members.length}명): 남은 좌석이 있는 예약 가능한 식당이 없음` }
        : { type: "DATA_MISSING", table_id: t.id, reason: `${slotLabel(slot)} ${t.no}번 테이블: 재검증 실패 (나이 차 ${t.check.ageGap}살, 충돌 관계 ${t.check.conflicts}건, ${t.members.length}명, 점수 ${t.total})` });
      for (const m of t.members) {
        const a = appById.get(m.appId)!;
        setStatus(a, "EXCEPTION", why);
        notify(a, "MATCH_EXCEPTION", "운영팀이 확인하고 있어요", "테이블은 구성됐지만 식당 배정을 확인하고 있어요. 처리되면 바로 알려 드릴게요.", "/home");
      }
    }
  }

  for (const group of chunk(tableUpdates, 20)) await Promise.all(group.map((f) => f()));

  // 남은 사람: 고른 다른 날짜가 있으면 그 회차 매칭으로 넘기고(재배치 3~4순위), 없으면 매칭 실패 → 대체 일정 추천
  let reallocated = 0;
  let failed = 0;
  const resolutions: Record<string, unknown>[] = [];
  const refundable: string[] = [];
  const updates: (() => PromiseLike<unknown>)[] = [];
  for (const { person, reason } of plan.leftovers) {
    const a = appById.get(person.appId)!;
    const mine = mySlots(a);
    const next = mine.filter((s) => s.match_at > matchAt && later.some((l) => l.id === s.id));
    const here = slotById.get(person.slotIds[0])!;
    if (next.length) {
      reallocated++;
      const nextLabel = [...new Set(next.map((s) => fmtEventDate(s.event_date)))].join(", ");
      const why = `${fmtEventDate(here.event_date)} ${reason} → ${nextLabel} 회차에서 다시 매칭`;
      updates.push(() => db.from("applications").update({ match_status: "REALLOCATING", reallocation_count: a.reallocation_count + 1, placement_reason: why }).eq("id", a.id));
      setStatus(a, "REALLOCATING", why);
      notify(a, "MATCH_REALLOCATING", "다른 테이블을 찾고 있어요",
        `${fmtEventDate(here.event_date)} 회차에서는 ${reason === "희망 회차 정원 마감" ? "정원이 마감됐어요" : "조건에 맞는 테이블을 찾지 못했어요"}. 신청한 ${nextLabel} 회차에서 자동으로 다시 찾을게요.`, "/home");
    } else {
      failed++;
      const myRegions = new Set(mine.map((s) => s.region));
      const chosen = new Set(mine.map((s) => s.id));
      const recommended = [...later.filter((s) => myRegions.has(s.region) && !chosen.has(s.id)), ...later.filter((s) => !myRegions.has(s.region))].slice(0, 3);
      // MAT-11: 대체 일정이 있으면 ALTERNATIVE_OFFERED(참가자 선택 대기), 없으면 NO_MATCH(매칭 종료)
      const status = recommended.length ? "ALTERNATIVE_OFFERED" : "NO_MATCH";
      const single = one(a.passes as { type: string } | null)?.type === "SINGLE";
      const why = `${a.reallocation_count > 0 ? `재배치 ${a.reallocation_count}회 후에도 ` : ""}${fmtEventDate(here.event_date)} ${reason}`;
      updates.push(() => db.from("applications").update({ match_status: status, placement_reason: why, ...(single ? { payment_status: "REFUND_AVAILABLE" } : {}) }).eq("id", a.id));
      setStatus(a, status, why);
      if (single) {
        refundable.push(a.id);
        changes.push({ entity: "application", entity_id: a.id, field: "payment_status", from_value: a.payment_status, to_value: "REFUND_AVAILABLE", actor: "SYSTEM", reason: "매칭 실패로 1회권 환불 선택 가능" });
      }
      resolutions.push({ application_id: a.id, recommended_slot_ids: recommended.map((s) => s.id), status: "PENDING", choice: null, resolved_at: null });
      const options = single ? "대체 일정 이동, 이용권 보관, 환불" : "대체 일정 이동, 멤버십 기한 연장";
      notify(a, "MATCH_FAILED", "이번 회차는 매칭되지 않았어요",
        recommended.length
          ? `${fmtEventDate(here.event_date)} 회차: ${reason}. 추천 일정: ${recommended.map(slotLabel).join(" / ")}. ${options} 중에서 고를 수 있어요.`
          : `${fmtEventDate(here.event_date)} 회차: ${reason}. 이동할 수 있는 다른 일정이 없어 이번 신청의 매칭을 마쳤어요. ${single ? "이용권 보관 또는 환불" : "멤버십 기한 연장"}을 선택할 수 있어요.`,
        "/resolve");
    }
  }
  for (const group of chunk(updates, 25)) await Promise.all(group.map((f) => f()));
  if (resolutions.length) await must(db.from("match_resolutions").upsert(resolutions, { onConflict: "application_id" }).select("id"), "실패 해결 저장");
  for (const ids of chunk(refundable, 80)) await db.from("payments").update({ status: "REFUND_AVAILABLE" }).in("application_id", ids).eq("status", "PAID");

  // 좌석이 다 찬 식당은 예약 완료로 표시
  const full = [...availBySlot.values()].flat().filter((a) => a.used > 0 && a.capacity - a.used < 4).map((a) => a.id);
  if (full.length) await db.from("venue_availability").update({ reservation_status: "RESERVED" }).in("id", full);

  if (exceptions.length) await db.from("exception_cases").insert(exceptions);
  for (const rows of chunk(notes, 300)) await db.from("notifications").insert(rows);
  for (const rows of chunk(changes, 300)) await db.from("status_history").insert(rows);

  const reasons: Record<string, number> = {};
  plan.leftovers.forEach((l) => (reasons[l.reason] = (reasons[l.reason] ?? 0) + 1));
  const confirmed = confirmedTables.reduce((s, t) => s + t.members.length, 0);
  await db.from("match_runs").update({
    finished_at: new Date().toISOString(),
    candidate_count: people.length,
    created_count: confirmedTables.length,
    split_merge_count: placed.filter((t) => t.step === 2).length,
    reallocated_count: reallocated,
    confirmed_count: confirmed,
    failed_count: failed,
    failure_summary: { reasons, unpaid, relations: { ...relationSummary, metSeated: placed.reduce((s, t) => s + t.check.metPairs, 0), conflictsSeated: placed.reduce((s, t) => s + t.check.conflicts, 0) }, dataMissing: exceptions.filter((e) => e.type === "DATA_MISSING").length, venueShortage: placed.length - confirmedTables.length },
  }).eq("id", runId);

  return { candidates: people.length, tables: confirmedTables.length, confirmed, reallocated, failed, exceptions: exceptions.length };
}

// 확정 안내 (단체방 공지): 날짜·시간·식당·예약명·큐레이션·취소 정책
function noticeText(slot: Slot, t: { members: Person[]; no: number; avail: { venue: { name: string; address: string | null; map_url: string | null; price_range: string | null } } | null }) {
  const v = t.avail!.venue;
  const count = new Map<string, number>();
  t.members.forEach((m) => m.interests.forEach((i) => count.set(i, (count.get(i) ?? 0) + 1)));
  const top = [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
  const curation = top.length
    ? `${top.join("·")}을(를) 좋아하는 분이 많은 ${t.members.length}명의 테이블이에요.`
    : `서로 다른 관심사를 가진 ${t.members.length}명이 모였어요. 새로운 이야기를 나눠 보세요.`;
  return [
    `${slotLabel(slot)} · ${v.name}`,
    `${v.address ?? ""}${mapLink(v) ? ` (지도: ${mapLink(v)})` : ""}`.trim(),
    ...(v.price_range ? [`식사 가격대: ${v.price_range}`] : []),
    `예약명: 우연한 식탁 ${t.no}번 테이블`,
    "",
    `오늘의 테이블: ${curation}`,
    "",
    "취소 정책: 매칭 마감 이후 취소는 환불되지 않고, 당일 취소·노쇼는 이용 제한 대상이에요. 행사 당일에는 단체방을 나갈 수 없어요.",
  ].join("\n");
}

/** 시연용: 가장 최근 매칭 실행을 되돌린다 (테이블·단체방·알림을 지우고 신청을 매칭 대기로 되돌림) */
export async function resetLatestRun(): Promise<MatchResult> {
  const db = createAdminClient();
  const { data: run } = await db.from("match_runs").select("id, match_at, started_at, slot_ids").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (!run) return { ok: true, message: "되돌릴 매칭 실행이 없어요." };
  const slotIds: string[] = run.slot_ids ?? [];
  const tables = await must(db.from("dining_tables").select("id, venue_availability_id").eq("match_run_id", run.id), "테이블 조회");
  const tableIds = (tables as { id: string; venue_availability_id: string | null }[]).map((t) => t.id);
  const availIds = [...new Set((tables as { venue_availability_id: string | null }[]).map((t) => t.venue_availability_id).filter(Boolean))] as string[];

  // 이번 실행으로 상태가 바뀐 신청: 이번 회차에서 확정·예외, 또는 이번 실행 이후 재배치·실패가 된 신청
  const links = slotIds.length ? await must(db.from("application_slots").select("application_id").in("slot_id", slotIds), "후보 조회") : [];
  const appIds = [...new Set((links as { application_id: string }[]).map((l) => l.application_id))];
  for (const ids of chunk(appIds, 80)) {
    await db.from("applications")
      .update({ match_status: "WAITING", confirmed_slot_id: null, attendance_status: null, placement_reason: null, reallocation_count: 0 })
      .in("id", ids).eq("application_status", "SUBMITTED").in("match_status", ["CONFIRMED", "REALLOCATING", "ALTERNATIVE_OFFERED", "TRANSFERRED", "NO_MATCH", "EXCEPTION"])
      .or(`confirmed_slot_id.is.null,confirmed_slot_id.in.(${slotIds.join(",")})`);
    await db.from("match_resolutions").delete().in("application_id", ids);
    await db.from("applications").update({ payment_status: "PAID" }).in("id", ids).eq("payment_status", "REFUND_AVAILABLE");
    await db.from("payments").update({ status: "PAID" }).in("application_id", ids).eq("status", "REFUND_AVAILABLE");
  }
  if (tableIds.length) {
    for (const ids of chunk(tableIds, 100)) {
      await db.from("exception_cases").delete().in("table_id", ids);
      await db.from("dining_tables").delete().in("id", ids); // 구성원·단체방·메시지는 함께 지워진다
    }
  }
  if (availIds.length) await db.from("venue_availability").update({ reservation_status: "AVAILABLE" }).in("id", availIds).eq("reservation_status", "RESERVED");
  await db.from("notifications").delete().like("template_key", "MATCH_%").gte("created_at", run.started_at);
  await db.from("status_history").delete().eq("entity", "application").eq("actor", "SYSTEM").gte("created_at", run.started_at);
  if (slotIds.length) await db.from("event_slots").update({ status: "OPEN" }).in("id", slotIds);
  await db.from("match_runs").delete().eq("id", run.id);
  return { ok: true, message: `${fmtDeadline(run.match_at)} 마감 매칭을 되돌렸어요. 다시 실행할 수 있어요.` };
}
