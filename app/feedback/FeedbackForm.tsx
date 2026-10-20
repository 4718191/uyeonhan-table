"use client";

import { useActionState } from "react";
import { Card, FormError, btnPrimary, btnSecondary } from "@/components/mobile";
import { reportUser, submitFeedback } from "./actions";

const QUESTIONS: [name: string, label: string][] = [
  ["mood", "테이블 분위기는 어땠나요?"],
  ["conversation", "대화는 즐거웠나요?"],
  ["venue", "식당은 만족스러웠나요?"],
  ["rejoin_intent", "다시 참여하고 싶나요?"],
  ["recommend_intent", "친구에게 추천하고 싶나요?"],
];

function Scale({ name, label }: { name: string; label: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border-[1.5px] border-stone-400 bg-white text-sm has-checked:border-stone-900 has-checked:bg-stone-900 has-checked:text-white">
            <input type="radio" name={name} value={n} className="sr-only" required />
            {n}
          </label>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-stone-500"><span>아쉬웠어요</span><span>최고예요</span></div>
    </fieldset>
  );
}

export function FeedbackForm({ others }: { others: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(submitFeedback, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Card>
        <h2 className="text-base font-bold">만족도</h2>
        {QUESTIONS.map(([n, l]) => <Scale key={n} name={n} label={l} />)}
      </Card>
      <Card>
        <h2 className="text-base font-bold">함께한 분들</h2>
        <p className="text-xs text-stone-600">비공개예요. &quot;다시 만나고 싶지 않아요&quot;를 고르면 다음 매칭부터 같은 테이블에 배정되지 않아요.</p>
        {others.map((o) => (
          <fieldset key={o.id} className="flex flex-col gap-1.5 border-t border-stone-200 pt-3 first:border-t-0 first:pt-0">
            <legend className="text-sm font-semibold">{o.name}</legend>
            <div className="grid grid-cols-3 gap-1.5 text-[13px]">
              {[["WANT_AGAIN", "또 만나고 싶어요"], ["NONE", "상관없어요"], ["AVOID", "만나고 싶지 않아요"]].map(([v, l]) => (
                <label key={v} className="flex min-h-10 cursor-pointer items-center justify-center rounded-lg border-[1.5px] border-stone-400 bg-white px-1 text-center has-checked:border-stone-900 has-checked:bg-stone-900 has-checked:text-white">
                  <input type="radio" name={`pref-${o.id}`} value={v} defaultChecked={v === "NONE"} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </Card>
      <FormError message={state?.error} />
      <button disabled={pending} className={btnPrimary}>{pending ? "저장 중…" : "피드백 보내기"}</button>
    </form>
  );
}

export function ReportForm({ others }: { others: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(reportUser, undefined);
  return (
    <details className="rounded-xl border-[1.5px] border-stone-400 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold">불쾌한 일이 있었나요? 신고·차단하기</summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">누구인가요?</span>
          <select name="to" required className="min-h-11 rounded-lg border-[1.5px] border-stone-400 bg-white px-3">
            {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">어떤 일이 있었나요?</span>
          <textarea name="reason" required minLength={5} maxLength={1000} rows={4} className="rounded-lg border-[1.5px] border-stone-400 p-3" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="block" defaultChecked className="h-5 w-5 accent-stone-900" /> 이 사람을 차단할게요
        </label>
        <p className="text-xs text-stone-600">신고 내용과 차단 여부는 상대에게 공개되지 않아요. 운영팀이 검토하고, 다음 매칭부터 같은 테이블에 배정되지 않아요.</p>
        {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        {state?.ok && <p role="status" className="text-sm font-semibold">{state.ok}</p>}
        <button disabled={pending} className={btnSecondary}>{pending ? "접수 중…" : "신고하기"}</button>
      </form>
    </details>
  );
}
