import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deliver } from "@/lib/delivery";

// 앱 내 알림 (PRD 14장 알림 시나리오, 앱 푸시 대신 앱 안에서 보여 준다)
export type NotifyInput = {
  profileId: string;
  key: string; // 알림 종류 (예: APPLICATION_SUBMITTED)
  title: string;
  body: string;
  link?: string;
};

export async function notify(db: SupabaseClient, input: NotifyInput | NotifyInput[]) {
  const list = Array.isArray(input) ? input : [input];
  if (list.length === 0) return;
  const now = new Date().toISOString();
  // 실패하면 자동 재시도하고, 반복 실패만 운영자 예외로 (INF-08). 알림 실패가 신청·결제 자체를 막지는 않는다.
  await deliver(db, "notifications", list.map((n) => ({
    profile_id: n.profileId,
    template_key: n.key,
    title: n.title,
    body: n.body,
    link: n.link ?? null,
    scheduled_at: now,
    sent_at: now,
  })), "앱 알림");
}
