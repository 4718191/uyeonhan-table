"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp } from "./actions";

export default function SignUpPage() {
  const [state, action, pending] = useActionState(signUp, undefined);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">회원가입</h1>
        <p className="text-sm text-stone-600">가입하면 바로 프로필을 작성하고 모임을 신청할 수 있어요.</p>
      </div>
      <form action={action} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          이메일
          <input name="email" type="email" required autoComplete="email" defaultValue={state?.email}
            className="min-h-11 rounded-lg border border-stone-400 bg-white px-3 font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          비밀번호 <span className="font-normal text-stone-600">8자 이상</span>
          <input name="password" type="password" required minLength={8} autoComplete="new-password"
            className="min-h-11 rounded-lg border border-stone-400 bg-white px-3 font-normal" />
        </label>
        {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        <button disabled={pending} className="min-h-12 rounded-xl bg-stone-900 font-semibold text-white disabled:opacity-60">
          {pending ? "가입 중…" : "가입하고 시작하기"}
        </button>
      </form>
      <p className="text-center text-sm text-stone-600">
        이미 계정이 있나요? <Link href="/login" className="font-semibold text-stone-900 underline">로그인</Link>
      </p>
    </main>
  );
}
