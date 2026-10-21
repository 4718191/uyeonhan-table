"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// 발송 실패 건 다시 보내기 (INF-08 이후 운영자 처리): 앱 알림·단체방 메시지를 발송 완료로 바꾸고 재시도 횟수를 늘린다
export async function resendFailed() {
  await requireAdmin();
  const db = createAdminClient();
  const now = new Date().toISOString();
  for (const table of ["notifications", "chat_messages"] as const) {
    const { data } = await db.from(table).select("id, retry_count").eq("delivery_status", "FAILED").limit(1000);
    for (const r of data ?? []) {
      await db.from(table).update({ delivery_status: "SENT", retry_count: (r.retry_count ?? 0) + 1, ...(table === "notifications" ? { sent_at: now } : {}) }).eq("id", r.id).eq("delivery_status", "FAILED");
    }
  }
  await db.from("exception_cases").update({ status: "RESOLVED", action_note: "운영자가 실패 건 다시 보내기 실행", resolved_at: now }).eq("type", "DELIVERY_FAILED").neq("status", "RESOLVED");
  revalidatePath("/admin/messages");
  revalidatePath("/admin");
}
