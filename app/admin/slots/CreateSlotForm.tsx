"use client";

import { useActionState } from "react";
import { Notice, btnCls, inputCls, labelCls } from "@/components/admin";
import { REGIONS } from "@/lib/constants";
import { createSlots } from "./actions";

export function CreateSlotForm({ defaultDate }: { defaultDate: string }) {
  const [state, action, pending] = useActionState(createSlots, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>날짜<input name="date" type="date" required defaultValue={defaultDate} className={inputCls} /></label>
        <label className={labelCls}>시간<input name="time" type="time" required defaultValue="19:30" className={inputCls} /></label>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">지역 (서울 4개 중 선택)</legend>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(REGIONS).map(([code, label]) => (
            <label key={code} className="flex min-h-10 items-center gap-2 rounded-lg border-[1.5px] border-stone-400 px-3 text-sm has-checked:border-stone-900">
              <input type="checkbox" name="regions" value={code} defaultChecked className="h-4 w-4 accent-stone-900" /> {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className={labelCls}>정원 (지역별)<input name="capacity" type="number" min={4} max={200} required defaultValue={36} className={inputCls} /></label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="open_venues" defaultChecked className="h-4 w-4 accent-stone-900" />
        이 날짜·시간에 지역 식당 수용 인원도 함께 열기 (식당별 18명)
      </label>
      <p className="text-xs leading-relaxed text-stone-600">
        신청·환불 마감과 자동 매칭 실행 시각은 행사 직전 화요일 24:00으로 자동으로 정해져요.
        그 시각이 되면 운영자 조작 없이 자동 매칭이 시작돼요.
      </p>
      <Notice state={state} />
      <button disabled={pending} className={btnCls}>{pending ? "만드는 중…" : "회차 만들기"}</button>
    </form>
  );
}
