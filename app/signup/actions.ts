"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SignUpState = { error?: string; email?: string } | undefined;

// 회원가입 (P-1). 해커톤 시연용이라 이메일 인증 없이 바로 가입·로그인한다.
export async function signUp(_: SignUpState, formData: FormData): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "이메일 형식을 확인해 주세요.", email };
  if (password.length < 8) return { error: "비밀번호는 8자 이상으로 정해 주세요.", email };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    const exists = /already|registered|exists/i.test(error.message);
    return { error: exists ? "이미 가입된 이메일이에요. 로그인해 주세요." : "가입하지 못했어요. 잠시 후 다시 시도해 주세요.", email };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) redirect("/login");
  redirect("/profile");
}
