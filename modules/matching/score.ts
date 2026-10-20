// 매칭 점수 계산 (MVP_기능_범위.md 5장). DB를 모르는 순수 함수라 가상 데이터로 시뮬레이션할 수 있다.

export type Person = {
  appId: string;
  profileId: string;
  name: string;
  birthYear: number;
  gender: "F" | "M" | null;
  mbti: string | null;
  interests: string[];
  selfTraits: string[];
  wantedTraits: string[];
  slotIds: string[]; // 이번 매칭 대상 회차 중 이 사람이 고른 회차
};

export type Weights = {
  w_age: number;
  w_gender: number;
  w_mbti: number;
  w_interest: number;
  w_wanted: number;
  w_new_people: number;
  min_score: number;
};

/** 두 사람 관계: blocked = 같은 테이블 불가(차단·신고·비선호), met = 이전에 만난 적 있음 */
export type Relations = { blocked: Set<string>; met: Set<string> };

export const MIN_SIZE = 4;
export const MAX_SIZE = 6;
export const MAX_AGE_GAP = 8;

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** 서로 "또 만나고 싶어요"를 고른 사이는 이전 만남(met)에서 빼서 감점하지 않는다 (FDB-04 → 다음 매칭 반영) */
export function applyMutualWantAgain(met: Set<string>, wants: { from_profile: string; to_profile: string }[]) {
  const set = new Set(wants.map((w) => `${w.from_profile}>${w.to_profile}`));
  for (const w of wants) if (set.has(`${w.to_profile}>${w.from_profile}`)) met.delete(pairKey(w.from_profile, w.to_profile));
  return met;
}

function pairs<T>(xs: T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) out.push([xs[i], xs[j]]);
  return out;
}

/** 필수 조건: 나이 차 8살 이내, 차단·신고·비선호 관계 없음 (인원 4~6명은 조합 단계에서 확인) */
export function canJoin(table: Person[], p: Person, rel: Relations) {
  const years = [...table.map((m) => m.birthYear), p.birthYear];
  if (Math.max(...years) - Math.min(...years) > MAX_AGE_GAP) return false;
  return table.every((m) => !rel.blocked.has(pairKey(m.profileId, p.profileId)));
}

export function ageScore(members: Person[]) {
  const ys = members.map((m) => m.birthYear);
  const span = Math.max(...ys) - Math.min(...ys);
  return span <= 3 ? 1 : span <= 5 ? 0.75 : span <= MAX_AGE_GAP ? 0.5 : 0;
}

export function genderScore(members: Person[]) {
  const f = members.filter((m) => m.gender === "F").length;
  const m = members.filter((x) => x.gender === "M").length;
  if (f === 0 || m === 0) return 0;
  const d = Math.abs(f - m);
  return d <= 1 ? 1 : d === 2 ? 0.5 : 0.25;
}

// 두 사람씩 짝지어 S/N이 같으면 0.5, E/I가 다르면 0.5 (팀 결정). MBTI를 모르면 중간값 0.5.
export function mbtiScore(members: Person[]) {
  const ps = pairs(members);
  if (ps.length === 0) return 0;
  const sum = ps.reduce((s, [a, b]) => {
    if (!a.mbti || !b.mbti) return s + 0.5;
    return s + (a.mbti[1] === b.mbti[1] ? 0.5 : 0) + (a.mbti[0] !== b.mbti[0] ? 0.5 : 0);
  }, 0);
  return sum / ps.length;
}

export function interestScore(members: Person[]) {
  const ps = pairs(members);
  if (ps.length === 0) return 0;
  const hit = ps.filter(([a, b]) => a.interests.filter((i) => b.interests.includes(i)).length >= 2).length;
  return hit / ps.length;
}

// "만나고 싶은 사람" 선택지를 상대의 "나는 어떤 사람" 응답과 연결한다
const has = (trait: string) => (_me: Person, others: Person[]) => others.some((o) => o.selfTraits.includes(trait));
const WANTED_RULES: Record<string, (me: Person, others: Person[]) => boolean> = {
  "나와 비슷한 사람": (me, others) => others.some((o) => o.selfTraits.some((t) => me.selfTraits.includes(t))),
  "나와 다른 자극을 주는 사람": (me, others) => others.some((o) => o.selfTraits.some((t) => !me.selfTraits.includes(t))),
  "깊은 대화가 되는 사람": has("깊은 대화를 좋아함"),
  "편하고 유머 있는 사람": has("가볍고 유머 있는 대화를 좋아함"),
  "열정 있는 사람": has("활기차고 에너지 있는 편"),
  "잔잔하고 안정적인 사람": (me, others) => has("잔잔하고 조용한 편")(me, others) || has("경청을 잘 함")(me, others),
};

export function wantedScore(members: Person[]) {
  const each = members.map((me) => {
    const others = members.filter((o) => o !== me);
    const wants = me.wantedTraits.filter((w) => w in WANTED_RULES);
    if (wants.length === 0) return 1;
    return wants.filter((w) => WANTED_RULES[w](me, others)).length / wants.length;
  });
  return each.reduce((a, b) => a + b, 0) / members.length;
}

export function newPeopleScore(members: Person[], rel: Relations) {
  const ps = pairs(members);
  if (ps.length === 0) return 1;
  return ps.filter(([a, b]) => !rel.met.has(pairKey(a.profileId, b.profileId))).length / ps.length;
}

export type ScoreParts = { age: number; gender: number; mbti: number; interest: number; wanted: number; newPeople: number };

export function tableScore(members: Person[], w: Weights, rel: Relations) {
  const parts: ScoreParts = {
    age: ageScore(members),
    gender: genderScore(members),
    mbti: mbtiScore(members),
    interest: interestScore(members),
    wanted: wantedScore(members),
    newPeople: newPeopleScore(members, rel),
  };
  const total =
    parts.age * w.w_age + parts.gender * w.w_gender + parts.mbti * w.w_mbti +
    parts.interest * w.w_interest + parts.wanted * w.w_wanted + parts.newPeople * w.w_new_people;
  return { total: Math.round(total * 100) / 100, parts };
}
