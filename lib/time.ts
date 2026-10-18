// 한국 시간(KST) 기준 날짜·시각 표기와 계산
// 서버(Vercel)는 UTC로 돌기 때문에 Date의 로컬 시간 함수를 쓰지 않고 +9시간으로 직접 계산한다.

const KST_OFFSET = 9 * 3600 * 1000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");

function kst(d: Date) {
  const s = new Date(d.getTime() + KST_OFFSET);
  return {
    y: s.getUTCFullYear(),
    m: s.getUTCMonth() + 1,
    d: s.getUTCDate(),
    wd: WEEKDAYS[s.getUTCDay()],
    h: s.getUTCHours(),
    min: s.getUTCMinutes(),
  };
}

/** "2026-10-22" → "10/22 (목)" */
export function fmtEventDate(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${WEEKDAYS[d.getUTCDay()]})`;
}

/** "19:30:00" → "19:30" */
export function fmtTime(time: string) {
  return time.slice(0, 5);
}

/** 마감 시각 표기. KST 00:00은 전날 24:00으로 보여 준다. 예: "10/20 (화) 24:00" */
export function fmtDeadline(iso: string) {
  const at = new Date(iso);
  const p = kst(at);
  if (p.h === 0 && p.min === 0) {
    const prev = kst(new Date(at.getTime() - 60 * 1000));
    return `${prev.m}/${prev.d} (${prev.wd}) 24:00`;
  }
  return `${p.m}/${p.d} (${p.wd}) ${pad(p.h)}:${pad(p.min)}`;
}

/** 알림 목록 등에 쓰는 짧은 시각. 예: "10/18 14:05" */
export function fmtDateTime(iso: string) {
  const p = kst(new Date(iso));
  return `${p.m}/${p.d} ${pad(p.h)}:${pad(p.min)}`;
}

/** 오늘 날짜 (KST, YYYY-MM-DD) */
export function todayKST() {
  const p = kst(new Date());
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** YYYY-MM-DD에 개월 수를 더한 날짜 */
export function addMonths(date: string, months: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD에 일 수를 더한 날짜 */
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 행사 직전 화요일 24:00 (= 수요일 00:00 KST). 신청·환불·자동 매칭 마감 (MVP 6장).
 * 행사일보다 앞선 가장 가까운 수요일 00:00을 돌려준다. 목요일 행사면 하루 전.
 */
export function deadlineForEvent(eventDate: string) {
  const d = new Date(`${eventDate}T00:00:00Z`);
  const back = (d.getUTCDay() - 3 + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() - back);
  return new Date(d.getTime() - KST_OFFSET).toISOString();
}
