"use client";

import { useActionState } from "react";
import { btnPrimary } from "@/components/mobile";
import { checkIn } from "./actions";

export function CheckInButton({ applicationId }: { applicationId: string }) {
  const [state, action, pending] = useActionState(checkIn.bind(null, applicationId), undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <button disabled={pending} className={btnPrimary}>{pending ? "체크인 중…" : "도착했어요 · 체크인"}</button>
      {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
