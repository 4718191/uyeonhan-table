import "server-only";

// 예약 작업 실행기 (시스템_설계.md 3장)
// Vercel Cron과 운영자 "지금 실행" 버튼이 같은 함수를 호출한다.
// 각 작업은 여러 번 실행돼도 결과가 중복되지 않게(멱등) 구현한다.

export type JobName = "match" | "remind" | "post-content" | "close-event";
export type JobTrigger = "CRON" | "ADMIN";
export type JobResult = { job: JobName; ok: boolean; message: string };

export const JOB_LABELS: Record<JobName, string> = {
  match: "자동 매칭 실행",
  remind: "행사 1일 전 리마인드 발송",
  "post-content": "대화 콘텐츠 게시",
  "close-event": "행사 종료 처리 (노쇼 후보 판정)",
};

export function isJobName(value: string): value is JobName {
  return value in JOB_LABELS;
}

export async function runJob(job: JobName, trigger: JobTrigger): Promise<JobResult> {
  // TODO(10/19): match — modules/matching 구현 후 연결
  // TODO(10/20): remind, post-content, close-event
  return { job, ok: false, message: `${JOB_LABELS[job]}: 아직 구현 전입니다 (trigger=${trigger}).` };
}
