// 발송 재시도 (INF-08) 테스트: 실패하면 최대 3번까지 다시 보내고, 3번 모두 실패한 것만 실패로 돌려준다.
// 실행: npx tsx scripts/test/delivery.test.ts
import { MAX_ATTEMPTS, withRetry } from "../../lib/retry";

let fail = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "통과" : "실패"}  ${msg}`); if (!ok) fail++; };
const err = { message: "일시적인 네트워크 오류" };

(async () => {
  let calls = 0;
  const a = await withRetry(async () => ({ error: ++calls < 2 ? err : null }), 1);
  check(a.ok && a.attempts === 2, `1번 실패 후 재시도로 성공 (시도 ${a.attempts}번, retry_count ${a.attempts - 1}로 기록)`);

  calls = 0;
  const b = await withRetry(async () => { calls++; return { error: err }; }, 1);
  check(!b.ok && calls === MAX_ATTEMPTS, `계속 실패하면 ${MAX_ATTEMPTS}번까지만 시도하고 실패로 처리 → 운영자 예외`);

  calls = 0;
  const c = await withRetry(async () => { calls++; return { error: { message: "duplicate", code: "23505" } }; }, 1);
  check(c.ok && c.duplicate === true && calls === 1, "이미 보낸 메시지(유일 키 충돌)는 다시 보내지 않고 성공으로 처리 (중복 발송 없음)");

  calls = 0;
  const d = await withRetry(async () => { calls++; return { error: null }; }, 1);
  check(d.ok && calls === 1, "처음에 성공하면 한 번만 보냄");

  console.log(fail ? `\n${fail}개 실패` : "\n모두 통과");
  process.exit(fail ? 1 : 0);
})();
