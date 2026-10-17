import "server-only";
import { createClient } from "@supabase/supabase-js";

// 시스템 작업 전용 (매칭·환불·알림 발송). RLS를 우회하므로 서버에서만 사용한다.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase 환경 변수가 설정되지 않았습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
