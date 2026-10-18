"use client";

import { useActionState } from "react";
import { Card, FormError, OptionBox, btnPrimary } from "@/components/mobile";
import { submitApplication } from "./actions";

export type DateOption = { date: string; label: string; time: string; deadline: string };
export type RegionOption = { code: string; label: string };

export function ApplyForm({ dates, regions }: { dates: DateOption[]; regions: RegionOption[] }) {
  const [state, action, pending] = useActionState(submitApplication, undefined);
  const chosenDates = state?.dates ?? [];
  const chosenRegions = state?.regions ?? [];
  return (
    <form key={JSON.stringify(state ?? {})} action={action} className="flex flex-col gap-4">
      <Card>
        <h2 className="text-base font-bold">참가 가능한 날짜 <span className="text-sm font-normal text-stone-600">(복수 선택)</span></h2>
        {dates.map((d) => (
          <OptionBox key={d.date} name="dates" value={d.date} defaultChecked={chosenDates.includes(d.date)}>
            <span className="flex flex-col">
              <span className="font-semibold">{d.label} {d.time}</span>
              <span className="text-xs text-stone-600">신청·환불 마감 {d.deadline}</span>
            </span>
          </OptionBox>
        ))}
      </Card>

      <Card>
        <h2 className="text-base font-bold">희망 지역 <span className="text-sm font-normal text-stone-600">(복수 선택)</span></h2>
        <div className="grid grid-cols-2 gap-2">
          {regions.map((r) => (
            <OptionBox key={r.code} name="regions" value={r.code} defaultChecked={chosenRegions.includes(r.code)}>
              {r.label}
            </OptionBox>
          ))}
        </div>
        <p className="text-xs text-stone-600">현재는 서울 4개 지역에서만 모임을 열어요.</p>
      </Card>

      <FormError message={state?.error} />
      <button disabled={pending} className={btnPrimary}>{pending ? "제출 중…" : "신청서 제출"}</button>
    </form>
  );
}
