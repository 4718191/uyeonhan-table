import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// 첫 화면: 로그인했으면 역할에 맞는 화면으로, 아니면 서비스 소개와 로그인·가입
export default async function Landing() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
    redirect(profile?.role === "admin" ? "/admin" : "/home");
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-bold">우연한 식탁</h1>
      <p className="text-stone-600">
        처음 보는 4~6명이 결이 맞는 사람들과 한 테이블에서 저녁을 먹어요. 날짜와 지역만 고르면 매칭부터 식당 예약, 단체방 안내까지 자동으로 진행돼요.
      </p>
      <div className="flex flex-col gap-2">
        <Link href="/signup" className="rounded-xl bg-stone-900 px-4 py-3 text-center font-semibold text-white">시작하기</Link>
        <Link href="/login" className="rounded-xl border-[1.5px] border-stone-900 bg-white px-4 py-3 text-center font-semibold">로그인</Link>
      </div>
    </main>
  );
}
