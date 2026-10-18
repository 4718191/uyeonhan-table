"use client";

import { useActionState } from "react";
import { Card, Chip, FormError, btnPrimary } from "@/components/mobile";
import { INTERESTS, MBTI_AXES, PRICE_RANGES, SELF_TRAITS, WANTED_TRAITS } from "@/lib/options";
import { saveProfile, type ProfileValues } from "./actions";

const input = "min-h-11 w-full rounded-lg border-[1.5px] border-stone-400 bg-white px-3 text-[15px]";
const label = "flex flex-col gap-1.5 text-sm font-semibold";

export function ProfileForm({ initial, onboarding }: { initial: ProfileValues; onboarding: boolean }) {
  const [state, action, pending] = useActionState(saveProfile, undefined);
  // 저장에 실패하면 방금 입력한 값을 그대로 다시 보여 준다
  const v = state?.values ?? initial;
  const key = JSON.stringify(v);

  return (
    <form key={key} action={action} className="flex flex-col gap-4">
      <Card>
        <h2 className="text-base font-bold">기본 정보</h2>
        <label className={label}>이름
          <input name="name" required maxLength={20} defaultValue={v.name} className={input} placeholder="이름" />
        </label>
        <label className={label}>연락처
          <input name="phone" type="tel" required defaultValue={v.phone} className={input} placeholder="010-0000-0000" inputMode="tel" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>출생연도
            <input name="birth_year" required inputMode="numeric" maxLength={4} defaultValue={v.birth_year} className={input} placeholder="1996" />
          </label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-semibold">성별</legend>
            <div className="flex gap-2">
              <Chip type="radio" name="gender" value="F" label="여" defaultChecked={v.gender === "F"} />
              <Chip type="radio" name="gender" value="M" label="남" defaultChecked={v.gender === "M"} />
            </div>
          </fieldset>
        </div>
        <label className={label}>직업
          <input name="job" required maxLength={30} defaultValue={v.job} className={input} placeholder="예: 마케터, 개발자" />
        </label>
      </Card>

      <Card>
        <h2 className="text-base font-bold">매칭 프로필</h2>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">MBTI <span className="font-normal text-stone-600">(모르면 비워 두세요)</span></legend>
          <div className="grid grid-cols-4 gap-1.5">
            {MBTI_AXES.map((pair, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                {pair.map((letter) => (
                  <Chip key={letter} type="radio" name={`mbti${i}`} value={letter} defaultChecked={v.mbti[i] === letter} />
                ))}
              </div>
            ))}
          </div>
        </fieldset>
        <ChipGroup title="요즘 관심사" name="interests" options={INTERESTS} selected={v.interests} />
        <ChipGroup title="나는 어떤 사람인가요?" name="self_traits" options={SELF_TRAITS} selected={v.self_traits} />
        <ChipGroup title="어떤 사람을 만나고 싶나요?" name="wanted_traits" options={WANTED_TRAITS} selected={v.wanted_traits} />
      </Card>

      <Card>
        <h2 className="text-base font-bold">식사 조건</h2>
        <ChipGroup title="희망 식사 가격대" name="price_ranges" options={PRICE_RANGES} selected={v.price_ranges} />
        <label className={label}>못 먹는 음식·알레르기
          <input name="food_restrictions" maxLength={100} defaultValue={v.food_restrictions} className={input} placeholder="없으면 비워 두세요" />
        </label>
      </Card>

      <Card>
        <label className="flex min-h-11 items-center gap-2.5 text-sm">
          <input type="checkbox" name="consent_privacy" defaultChecked={v.consent_privacy} className="h-5 w-5 accent-stone-900" />
          [필수] 개인정보 수집·이용 동의
        </label>
        <label className="flex min-h-11 items-center gap-2.5 text-sm">
          <input type="checkbox" name="consent_policy" defaultChecked={v.consent_policy} className="h-5 w-5 accent-stone-900" />
          [필수] 운영 정책 동의 (환불 규정·노쇼 이용 제한)
        </label>
      </Card>

      <FormError message={state?.error} />
      <button disabled={pending} className={btnPrimary}>
        {pending ? "저장 중…" : onboarding ? "다음: 일정 선택" : "저장하기"}
      </button>
    </form>
  );
}

function ChipGroup({ title, name, options, selected }: {
  title: string; name: string; options: readonly string[]; selected: string[];
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold">{title} <span className="font-normal text-stone-600">(복수 선택)</span></legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o} name={name} value={o} defaultChecked={selected.includes(o)} />
        ))}
      </div>
    </fieldset>
  );
}
