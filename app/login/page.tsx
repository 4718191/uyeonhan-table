"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-bold">로그인</h1>
      <p className="text-sm text-stone-600">가입한 계정이나 시연용 테스트 계정으로 로그인해요.</p>
      <form action={action} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          이메일
          <input name="email" type="email" required className="min-h-11 rounded-lg border border-stone-400 bg-white px-3 font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          비밀번호
          <input name="password" type="password" required className="min-h-11 rounded-lg border border-stone-400 bg-white px-3 font-normal" />
        </label>
        {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        <button disabled={pending} className="min-h-12 rounded-xl bg-stone-900 font-semibold text-white disabled:opacity-60">
          {pending ? "로그인 중…" : "로그인"}
        </button>
      </form>
      <p className="text-center text-sm text-stone-600">
        처음이세요? <Link href="/signup" className="font-semibold text-stone-900 underline">회원가입</Link>
      </p>
    </main>
  );
}
