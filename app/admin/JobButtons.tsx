"use client";

import { useActionState } from "react";
import { runJobNow } from "./actions";

const JOBS: { job: string; label: string }[] = [
  { job: "match", label: "지금 매칭 실행" },
  { job: "remind", label: "리마인드 발송" },
  { job: "post-content", label: "대화 콘텐츠 게시" },
  { job: "close-event", label: "행사 종료 처리" },
];

export function JobButtons() {
  const [result, action, pending] = useActionState(runJobNow, undefined);
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-wrap gap-2">
        {JOBS.map((j) => (
          <button key={j.job} name="job" value={j.job} disabled={pending}
            className="min-h-11 rounded-lg border-2 border-stone-900 bg-white px-4 text-sm font-semibold disabled:opacity-60">
            {j.label}
          </button>
        ))}
      </form>
      {result && <p role="status" className="text-sm text-stone-700">{result.message}</p>}
    </div>
  );
}
