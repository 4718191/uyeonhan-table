import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// 자동 발송과 재시도 (PRD INF-08, 16장 "메시지 자동 발송 성공·실패와 재시도 이력")
// 앱 알림과 단체방 시스템 메시지를 보낼 때 실패하면 잠깐 쉬었다가 최대 3번까지 다시 보낸다.
// 몇 번째 시도에 성공했는지는 retry_count로 남기고, 3번 모두 실패한 것만 발송 실패로 기록해 운영자 예외(DELIVERY_FAILED)로 올린다.

import { MAX_ATTEMPTS, withRetry } from "@/lib/retry";

type Table = "notifications" | "chat_messages";

/** 여러 건을 한 번에 보내고, 실패하면 재시도. 묶음 중 일부가 이미 보낸 메시지(유일 키 충돌)면 한 건씩 나눠 보낸다. */
export async function deliver(db: SupabaseClient, table: Table, rows: Record<string, unknown>[], label: string) {
  if (!rows.length) return { sent: 0, failed: 0 };
  let sent = 0, failed = 0;
  for (let i = 0; i < rows.length; i += 300) {
    const batch = rows.slice(i, i + 300);
    const r = await withRetry((attempt) => db.from(table).insert(batch.map((x) => ({ ...x, delivery_status: "SENT", retry_count: attempt - 1 }))));
    if (r.ok && !r.duplicate) { sent += batch.length; continue; }
    if (r.ok && r.duplicate && batch.length === 1) continue; // 이미 보낸 메시지
    if (r.ok && r.duplicate) {
      for (const one of batch) {
        const s = await withRetry((attempt) => db.from(table).insert({ ...one, delivery_status: "SENT", retry_count: attempt - 1 }));
        if (s.ok) { if (!s.duplicate) sent++; } else { failed++; await recordFailure(db, table, [one], label, s.error!); }
      }
      continue;
    }
    failed += batch.length;
    await recordFailure(db, table, batch, label, r.error!);
  }
  return { sent, failed };
}

async function recordFailure(db: SupabaseClient, table: Table, rows: Record<string, unknown>[], label: string, error: string) {
  // 실패 기록을 남겨 두면 운영자가 "실패 건 다시 보내기"로 재발송할 수 있다 (기록 자체도 실패할 수 있어 결과를 기다리지 않는다)
  await db.from(table).insert(rows.map((x) => ({ ...x, delivery_status: "FAILED", retry_count: MAX_ATTEMPTS }))).then(() => undefined, () => undefined);
  await db.from("exception_cases").insert({ type: "DELIVERY_FAILED", reason: `${label} ${rows.length}건 자동 발송 ${MAX_ATTEMPTS}회 시도 모두 실패: ${error}` }).then(() => undefined, () => undefined);
  console.error(`[발송 실패] ${label}: ${error}`);
}
