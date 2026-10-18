"use client";

import { useActionState, useState } from "react";
import { Notice, btnCls, inputCls, labelCls } from "@/components/admin";
import { REGIONS } from "@/lib/constants";
import { PRICE_RANGES } from "@/lib/options";
import { addAvailability, createVenue, saveMatchingSettings } from "./actions";

function AvailabilityFields({ defaultDate }: { defaultDate?: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <label className={labelCls}>날짜<input name="slot_date" type="date" defaultValue={defaultDate} className={inputCls} /></label>
      <label className={labelCls}>시간<input name="start_time" type="time" defaultValue="19:30" className={inputCls} /></label>
      <label className={labelCls}>수용 인원<input name="venue_capacity" type="number" min={4} max={100} defaultValue={18} className={inputCls} /></label>
    </div>
  );
}

export function CreateVenueForm({ defaultDate }: { defaultDate: string }) {
  const [state, action, pending] = useActionState(createVenue, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className={labelCls}>식당명<input name="name" required maxLength={40} className={inputCls} /></label>
      <label className={labelCls}>지역
        <select name="region" className={inputCls}>
          {Object.entries(REGIONS).map(([c, l]) => <option key={c} value={c}>{l}</option>)}
        </select>
      </label>
      <label className={labelCls}>주소<input name="address" className={inputCls} /></label>
      <label className={labelCls}>지도 링크<input name="map_url" type="url" placeholder="https://" className={inputCls} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className={labelCls}>가격대 (1인)
          <select name="price_range" className={inputCls}>{PRICE_RANGES.map((p) => <option key={p}>{p}</option>)}</select>
        </label>
        <label className={labelCls}>평점<input name="rating" type="number" step="0.1" min={0} max={5} defaultValue={4.5} className={inputCls} /></label>
      </div>
      <p className="text-xs text-stone-600">첫 수용 인원 (비워 두면 나중에 추가)</p>
      <AvailabilityFields defaultDate={defaultDate} />
      <Notice state={state} />
      <button disabled={pending} className={btnCls}>{pending ? "등록 중…" : "식당 등록"}</button>
    </form>
  );
}

export function AddAvailabilityForm({ venues, defaultDate }: { venues: { id: string; label: string }[]; defaultDate: string }) {
  const [state, action, pending] = useActionState(addAvailability, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className={labelCls}>식당
        <select name="venue_id" className={inputCls}>{venues.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select>
      </label>
      <AvailabilityFields defaultDate={defaultDate} />
      <Notice state={state} />
      <button disabled={pending} className={btnCls}>{pending ? "추가 중…" : "수용 인원 추가"}</button>
    </form>
  );
}

const WEIGHTS = [
  { key: "w_age", label: "연령 근접도" },
  { key: "w_gender", label: "성비" },
  { key: "w_mbti", label: "MBTI 궁합" },
  { key: "w_interest", label: "공통 관심사" },
  { key: "w_wanted", label: "만나고 싶은 사람" },
  { key: "w_new_people", label: "새로운 사람 비율" },
] as const;

export function MatchingSettingsForm({ initial }: { initial: Record<string, number> }) {
  const [state, action, pending] = useActionState(saveMatchingSettings, undefined);
  const [vals, setVals] = useState(initial);
  const sum = WEIGHTS.reduce((s, w) => s + (Number(vals[w.key]) || 0), 0);
  return (
    <form action={action} onReset={() => setVals(initial)} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {WEIGHTS.map((w) => (
          <label key={w.key} className={labelCls}>{w.label}
            <input name={w.key} type="number" min={0} max={100} required value={vals[w.key]}
              onChange={(e) => setVals({ ...vals, [w.key]: Number(e.target.value) })} className={inputCls} />
          </label>
        ))}
        <label className={labelCls}>최소 매칭 점수
          <input name="min_score" type="number" min={0} max={100} required value={vals.min_score}
            onChange={(e) => setVals({ ...vals, min_score: Number(e.target.value) })} className={inputCls} />
        </label>
      </div>
      <p className={`text-sm ${sum === 100 ? "text-stone-600" : "font-semibold text-red-700"}`}>가중치 합: {sum} / 100</p>
      <p className="text-xs leading-relaxed text-stone-600">
        필수 조건(4~6명, 나이 차 8살 이내, 날짜·지역 일치, 차단·신고·비선호 관계 없음)은 설정으로 바꿀 수 없어요.
        변경 이력은 기록되고, 다음 자동 매칭부터 적용돼요.
      </p>
      <Notice state={state} />
      <button disabled={pending || sum !== 100} className={`${btnCls} self-start`}>{pending ? "저장 중…" : "설정 저장"}</button>
    </form>
  );
}
