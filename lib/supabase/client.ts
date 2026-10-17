import { createBrowserClient } from "@supabase/ssr";

// 브라우저용 클라이언트 (단체방 실시간 구독 등)
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
