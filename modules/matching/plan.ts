// 한 번의 매칭(같은 마감 시각의 회차 묶음 = 같은 날짜의 지역별 회차)에서 테이블을 짜는 순수 로직.
// 재배치 순서 (MVP 3장, PRD 7.4):
//   1) 같은 날짜·같은 희망 지역에서 테이블 구성
//   2) 남은 사람은 같은 날짜·참가자가 고른 다른 지역의 테이블에 합류하거나 새 테이블 구성
//   3~4) 그래도 남으면 참가자가 고른 다른 날짜 회차에서 다시 매칭 (run.ts가 다음 매칭으로 넘김)
//   5~6) 다른 날짜 후보도 없으면 대체 일정 추천·보관·환불 안내 (run.ts)
// 필수 조건(나이 차·차단 관계·4~6명·최소 점수)은 어느 단계에서도 완화하지 않는다.

import { MAX_SIZE, MIN_SIZE, canJoin, tableScore, type Person, type Relations, type Weights } from "./score";

export type SlotInfo = { id: string; capacity: number };
export type PlannedTable = { slotId: string; members: Person[]; total: number; parts: ReturnType<typeof tableScore>["parts"]; step: 1 | 2 };
export type Plan = { tables: PlannedTable[]; leftovers: { person: Person; reason: string }[] };

type Ctx = { w: Weights; rel: Relations };

// 우선순위: 고른 회차가 적은 사람(다른 데로 갈 수 없는 사람)을 먼저, 그다음 나이순
const byPriority = (a: Person, b: Person) => a.slotIds.length - b.slotIds.length || a.birthYear - b.birthYear;

/** 남은 후보 중 점수를 가장 많이 올리는(덜 깎는) 사람을 한 명씩 더하며 테이블을 만든다 */
function growTable(seed: Person, pool: Person[], limit: number, ctx: Ctx) {
  const table = [seed];
  while (table.length < Math.min(MAX_SIZE, limit)) {
    let best: Person | null = null;
    let bestScore = -1;
    for (const c of pool) {
      if (table.includes(c) || !canJoin(table, c, ctx.rel)) continue;
      const s = tableScore([...table, c], ctx.w, ctx.rel).total;
      // 4명이 되기 전에는 일단 채우고, 4명 이후에는 최소 점수를 지킬 때만 더한다
      if (table.length + 1 > MIN_SIZE && s < ctx.w.min_score) continue;
      if (s > bestScore) { best = c; bestScore = s; }
    }
    if (!best) break;
    table.push(best);
  }
  return table;
}

/** 한 회차 안에서 정원(capacity)까지 테이블을 만든다 */
function buildForSlot(slot: SlotInfo, pool: Person[], seatsLeft: number, ctx: Ctx, step: 1 | 2) {
  const tables: PlannedTable[] = [];
  let remaining = [...pool].sort(byPriority);
  const skipped: Person[] = [];
  while (remaining.length >= MIN_SIZE && seatsLeft >= MIN_SIZE) {
    const seed = remaining[0];
    const members = growTable(seed, remaining.slice(1), seatsLeft, ctx);
    const score = tableScore(members, ctx.w, ctx.rel);
    if (members.length < MIN_SIZE || score.total < ctx.w.min_score) {
      // 이 사람을 중심으로는 조건을 만족하는 테이블이 안 나온다 → 다음 사람을 중심으로 시도
      skipped.push(seed);
      remaining = remaining.slice(1);
      continue;
    }
    tables.push({ slotId: slot.id, members, total: score.total, parts: score.parts, step });
    remaining = remaining.filter((p) => !members.includes(p));
    seatsLeft -= members.length;
  }
  return { tables, rest: [...skipped, ...remaining], seatsLeft };
}

/** 남은 사람을 이미 만든 6명 미만 테이블에 넣어 본다 (점수가 최소 점수 이상일 때만) */
function fillTables(people: Person[], tables: PlannedTable[], seats: Map<string, number>, ctx: Ctx) {
  const rest: Person[] = [];
  for (const p of people) {
    let best: PlannedTable | null = null;
    let bestScore = -1;
    for (const t of tables) {
      if (!p.slotIds.includes(t.slotId) || t.members.length >= MAX_SIZE || (seats.get(t.slotId) ?? 0) < 1) continue;
      if (!canJoin(t.members, p, ctx.rel)) continue;
      const s = tableScore([...t.members, p], ctx.w, ctx.rel).total;
      if (s >= ctx.w.min_score && s > bestScore) { best = t; bestScore = s; }
    }
    if (best) {
      best.members.push(p);
      const s = tableScore(best.members, ctx.w, ctx.rel);
      best.total = s.total;
      best.parts = s.parts;
      seats.set(best.slotId, (seats.get(best.slotId) ?? 0) - 1);
    } else rest.push(p);
  }
  return rest;
}

export function planBatch(people: Person[], slots: SlotInfo[], w: Weights, rel: Relations): Plan {
  const ctx: Ctx = { w, rel };
  const seats = new Map(slots.map((s) => [s.id, s.capacity]));
  const assigned = new Set<Person>();
  const tables: PlannedTable[] = [];

  // 1단계: 회차(지역)별로 테이블 구성. 수요가 정원에 가까운 회차부터 처리해 여러 지역을 고른 사람을 덜 붐비는 곳으로 보낼 여지를 둔다.
  const demand = (s: SlotInfo) => people.filter((p) => p.slotIds.includes(s.id)).length / Math.max(1, s.capacity);
  const order = [...slots].sort((a, b) => demand(b) - demand(a));
  for (const slot of order) {
    const pool = people.filter((p) => !assigned.has(p) && p.slotIds.includes(slot.id));
    const r = buildForSlot(slot, pool, seats.get(slot.id) ?? 0, ctx, 1);
    r.tables.forEach((t) => { tables.push(t); t.members.forEach((m) => assigned.add(m)); });
    seats.set(slot.id, r.seatsLeft);
  }
  // 같은 회차 안 남은 자리 채우기
  let rest = fillTables(people.filter((p) => !assigned.has(p)).sort(byPriority), tables, seats, ctx);
  tables.forEach((t) => t.members.forEach((m) => assigned.add(m)));

  // 2단계: 같은 날짜의 다른 희망 지역으로 재배치 — 남은 사람끼리 새 테이블을 만든다
  for (const slot of order) {
    const pool = rest.filter((p) => !assigned.has(p) && p.slotIds.includes(slot.id));
    if (pool.length < MIN_SIZE) continue;
    const r = buildForSlot(slot, pool, seats.get(slot.id) ?? 0, ctx, 2);
    r.tables.forEach((t) => { tables.push(t); t.members.forEach((m) => assigned.add(m)); });
    seats.set(slot.id, r.seatsLeft);
  }
  rest = fillTables(people.filter((p) => !assigned.has(p)), tables, seats, ctx);

  const leftovers = rest.map((person) => {
    const full = person.slotIds.every((id) => (seats.get(id) ?? 0) < 1);
    return { person, reason: full ? "희망 회차 정원 마감" : "조건(나이 차·인원·최소 점수)에 맞는 테이블 없음" };
  });
  return { tables, leftovers };
}
