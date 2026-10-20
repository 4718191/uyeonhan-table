"use client";

import { useActionState, useState } from "react";
import { btnSecondary } from "@/components/mobile";
import { cancelAttendance } from "./actions";

// 확정 후 취소: 환불이 없다는 점을 한 번 더 확인받는다
export function CancelAttendance({ applicationId, sameDay }: { applicationId: string; sameDay: boolean }) {
  const [state, action, pending] = useActionState(cancelAttendance.bind(null, applicationId), undefined);
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return <button type="button" onClick={() => setAsking(true)} className={btnSecondary}>참석 취소</button>;
  }
  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg border-[1.5px] border-stone-900 p-3">
      <p className="text-sm font-semibold">정말 참석을 취소할까요?</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-stone-700">
        <li>매칭 마감 이후 취소라 환불되지 않아요.</li>
        {sameDay ? (
          <>
            <li>당일 취소는 노쇼와 같이 이용 제한 검토 대상이에요.</li>
            <li>행사 당일에는 단체방을 나갈 수 없어요.</li>
          </>
        ) : (
          <li>테이블에서 빠지고, 남은 분들께 인원 변경이 자동으로 안내돼요.</li>
        )}
      </ul>
      {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setAsking(false)} className={btnSecondary}>그대로 참석할게요</button>
        <button disabled={pending} className="min-h-12 rounded-xl bg-stone-900 font-semibold text-white disabled:opacity-50">
          {pending ? "취소 중…" : "참석 취소"}
        </button>
      </div>
    </form>
  );
}
