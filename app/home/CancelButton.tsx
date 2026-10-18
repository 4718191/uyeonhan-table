"use client";

import { useActionState, useState } from "react";
import { btnSecondary } from "@/components/mobile";
import { cancelApplication } from "./actions";

// 실수로 누르지 않도록 한 번 더 확인한다
export function CancelButton({ applicationId, refundNote }: { applicationId: string; refundNote: string }) {
  const [state, action, pending] = useActionState(cancelApplication.bind(null, applicationId), undefined);
  const [asking, setAsking] = useState(false);

  if (state?.done) return <p role="status" className="text-sm font-semibold">{state.done}</p>;

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={btnSecondary}>
        신청 취소
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg border-[1.5px] border-stone-900 p-3">
      <p className="text-sm font-semibold">정말 취소할까요?</p>
      <p className="text-sm text-stone-600">{refundNote}</p>
      {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setAsking(false)} className={btnSecondary}>그대로 둘게요</button>
        <button disabled={pending} className="min-h-12 rounded-xl bg-stone-900 font-semibold text-white disabled:opacity-50">
          {pending ? "취소 중…" : "취소할게요"}
        </button>
      </div>
    </form>
  );
}
