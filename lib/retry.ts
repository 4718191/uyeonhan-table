// 재시도 로직 (순수 함수, 테스트용으로 server-only와 분리)

export const MAX_ATTEMPTS = 3;
type Err = { message: string; code?: string } | null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 실패하면 다시 시도한다. 유일 키 충돌(이미 보낸 메시지)은 성공으로 본다. 순수 로직이라 테스트할 수 있다. */
export async function withRetry(send: (attempt: number) => PromiseLike<{ error: Err }>, delayMs = 300) {
  let last: Err = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { error } = await send(attempt);
    if (!error || error.code === "23505") return { ok: true, attempts: attempt, duplicate: error?.code === "23505" };
    last = error;
    if (attempt < MAX_ATTEMPTS) await sleep(delayMs * attempt);
  }
  return { ok: false, attempts: MAX_ATTEMPTS, error: last?.message ?? "알 수 없는 오류" };
}
