// 다음 매칭 반영 시뮬레이션: 실제 매칭 엔진(planBatch, tableScore)을 가상 참가자로 돌려 관계 규칙을 확인한다.
// 실행: npx tsx scripts/test/relations.test.ts
import { planBatch } from "../../modules/matching/plan";
import { applyMutualWantAgain, pairKey, tableScore, type Person, type Relations, type Weights } from "../../modules/matching/score";
import { INTERESTS, SELF_TRAITS, WANTED_TRAITS } from "../../lib/options";

const W: Weights = { w_age: 25, w_gender: 22, w_mbti: 18, w_interest: 15, w_wanted: 10, w_new_people: 10, min_score: 55 };
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(xs: readonly T[], n: number) => [...xs].sort(() => rnd() - 0.5).slice(0, n);
const MB = ["ENFP", "INTJ", "ISFJ", "ESTP", "INFP", "ENTJ", "ISTJ", "ESFJ"];

function people(n: number): Person[] {
  return Array.from({ length: n }, (_, i) => ({
    appId: `a${i}`, profileId: `p${i}`, name: `참가자${i}`, birthYear: 1994 + Math.floor(rnd() * 6), gender: i % 2 ? "M" : "F",
    mbti: MB[Math.floor(rnd() * MB.length)], interests: pick(INTERESTS, 3), selfTraits: pick(SELF_TRAITS, 2), wantedTraits: pick(WANTED_TRAITS, 2), slotIds: ["s1"],
  }));
}
const together = (tables: { members: Person[] }[], a: string, b: string) =>
  tables.some((t) => t.members.some((m) => m.profileId === a) && t.members.some((m) => m.profileId === b));

let fail = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "통과" : "실패"}  ${msg}`); if (!ok) fail++; };

// 1) 차단·신고·비선호 관계는 절대 같은 테이블에 배정되지 않는다 (300번 무작위)
let pairsTested = 0, violations = 0, naturallyTogether = 0;
for (let run = 0; run < 300; run++) {
  const ps = people(24);
  const free: Relations = { blocked: new Set(), met: new Set() };
  const base = planBatch(ps, [{ id: "s1", capacity: 24 }], W, free);
  // 관계가 없을 때 실제로 같은 테이블이 된 쌍을 골라 차단해 본다 (규칙이 없으면 같이 앉았을 사람들)
  const t0 = base.tables.find((t) => t.members.length >= 2);
  if (!t0) continue;
  const [a, b] = t0.members;
  naturallyTogether++;
  const rel: Relations = { blocked: new Set([pairKey(a.profileId, b.profileId)]), met: new Set() };
  const plan = planBatch(ps, [{ id: "s1", capacity: 24 }], W, rel);
  pairsTested++;
  if (together(plan.tables, a.profileId, b.profileId)) violations++;
}
check(violations === 0, `차단 관계: 원래 같은 테이블이던 ${pairsTested}쌍을 차단하자 다시 같은 테이블이 된 경우 ${violations}건`);

// 2) 이전에 만난 사이는 "새로운 사람" 점수가 깎인다
const ps = people(6);
const noMet = tableScore(ps, W, { blocked: new Set(), met: new Set() });
const met = new Set([pairKey("p0", "p1"), pairKey("p2", "p3")]);
const withMet = tableScore(ps, W, { blocked: new Set(), met });
check(withMet.total < noMet.total, `이전 만남 2쌍: 총점 ${noMet.total} → ${withMet.total} (새로운 사람 ${Math.round(noMet.parts.newPeople * 100)}% → ${Math.round(withMet.parts.newPeople * 100)}%)`);

// 3) 서로 "또 만나고 싶어요"를 고른 사이는 감점하지 않는다. 한쪽만 고르면 그대로 감점
const met2 = new Set(met);
applyMutualWantAgain(met2, [
  { from_profile: "p0", to_profile: "p1" }, { from_profile: "p1", to_profile: "p0" }, // 서로 원함
  { from_profile: "p2", to_profile: "p3" },                                          // 한쪽만
]);
check(!met2.has(pairKey("p0", "p1")) && met2.has(pairKey("p2", "p3")), "서로 또 만나고 싶은 사이(p0·p1)만 감점에서 빠지고, 한쪽만 원한 사이(p2·p3)는 그대로");
const afterWant = tableScore(ps, W, { blocked: new Set(), met: met2 });
check(afterWant.total > withMet.total, `서로 원한 쌍 반영 후 총점 ${withMet.total} → ${afterWant.total}`);

console.log(fail ? `\n${fail}개 실패` : "\n모두 통과");
process.exit(fail ? 1 : 0);
