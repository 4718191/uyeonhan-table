"use client";

import { useActionState } from "react";
import { FormError } from "@/components/mobile";
import { withdraw } from "./actions";

export function WithdrawForm() {
  const [state, action, pending] = useActionState(withdraw, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" className="mt-0.5 h-5 w-5 accent-stone-900" />
        위 내용을 확인했고, 탈퇴하면 되돌릴 수 없다는 것을 알아요.
      </label>
      <FormError message={state?.error} />
      <button disabled={pending} className="min-h-12 rounded-xl border-[1.5px] border-red-700 bg-white text-[15px] font-semibold text-red-700 disabled:opacity-50">
        {pending ? "처리 중…" : "탈퇴하기"}
      </button>
    </form>
  );
}
