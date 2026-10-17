import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// 로그인한 사용자와 프로필을 가져온다. 없으면 로그인 화면으로 보낸다.
export async function requireProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  return { supabase, user, profile };
}

export async function requireAdmin() {
  const ctx = await requireProfile();
  if (ctx.profile?.role !== "admin") redirect("/home");
  return ctx;
}
