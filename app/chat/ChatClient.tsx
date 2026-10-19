"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { sendMessage } from "./actions";

// 새 메시지를 보려고 5초마다 화면을 새로 고친다 (MVP에서는 실시간 구독 대신 단순 새로고침)
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}

export function ScrollToEnd() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "end" }); }, []);
  return <div ref={ref} />;
}

export function SendForm({ roomId }: { roomId: string }) {
  const [state, action, pending] = useActionState(sendMessage.bind(null, roomId), undefined);
  return (
    <form action={action} className="sticky bottom-0 flex flex-col gap-1 border-t border-stone-400 bg-white px-3 py-2.5">
      {state?.error && <p role="alert" className="text-xs text-red-700">{state.error}</p>}
      <div className="flex gap-2">
        <label className="flex flex-1">
          <span className="sr-only">메시지</span>
          <input name="body" maxLength={500} autoComplete="off" placeholder="메시지 입력"
            className="min-h-11 flex-1 rounded-full border-[1.5px] border-stone-400 px-4 text-[15px]" />
        </label>
        <button disabled={pending} aria-label="보내기" className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-900 disabled:opacity-50">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" aria-hidden="true"><path d="M4 12l16-8-6 16-2-7z" /></svg>
        </button>
      </div>
    </form>
  );
}
