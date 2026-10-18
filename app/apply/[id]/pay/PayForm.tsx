"use client";

import { useActionState, useState } from "react";
import { Card, FormError, OptionBox, btnPrimary } from "@/components/mobile";
import { payApplication } from "./actions";

export type PassOption = { value: string; name: string; price: number; note?: string };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function PayForm({ applicationId, single, memberships, owned, deadline }: {
  applicationId: string;
  single: PassOption;
  memberships: PassOption[];
  owned: PassOption | null;
  deadline: string;
}) {
  const [state, action, pending] = useActionState(payApplication.bind(null, applicationId), undefined);
  const all = [...(owned ? [owned] : []), single, ...memberships];
  const [selected, setSelected] = useState((owned ?? single).value);
  const price = all.find((o) => o.value === selected)?.price ?? 0;

  return (
    <form action={action} onReset={() => setSelected((owned ?? single).value)} onChange={(e) => {
      const t = e.target as unknown as HTMLInputElement;
      if (t.name === "pass") setSelected(t.value);
    }} className="flex flex-col gap-4">
      {owned && (
        <Card>
          <h2 className="text-base font-bold">보유 이용권</h2>
          <OptionBox type="radio" name="pass" value={owned.value} defaultChecked>
            <span className="flex flex-1 flex-col">
              <span className="font-semibold">{owned.name}</span>
              {owned.note && <span className="text-xs text-stone-600">{owned.note}</span>}
            </span>
            <span className="font-semibold">추가 결제 없음</span>
          </OptionBox>
        </Card>
      )}

      <Card>
        <h2 className="text-base font-bold">1회권</h2>
        <OptionBox type="radio" name="pass" value={single.value} defaultChecked={!owned}>
          <span className="flex-1 font-semibold">{single.name}</span>
          <span className="font-semibold">{won(single.price)}</span>
        </OptionBox>
      </Card>

      <Card>
        <h2 className="text-base font-bold">멤버십</h2>
        <p className="text-sm text-stone-600">
          기간 안에 횟수 제한 없이 신청할 수 있어요. 매칭에 실패하면 실패 1회당 이용 기한이 1주 늘어나요.
        </p>
        {memberships.map((m) => (
          <OptionBox key={m.value} type="radio" name="pass" value={m.value}>
            <span className="flex-1 font-semibold">{m.name}</span>
            <span className="font-semibold">{won(m.price)}</span>
          </OptionBox>
        ))}
      </Card>

      <Card>
        <h2 className="text-base font-bold">환불 규정·노쇼 정책</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed">
          <li>{deadline}까지는 신청을 취소하고 환불받을 수 있어요. (1회권 기준)</li>
          <li>마감 이후와 당일 취소는 환불되지 않아요.</li>
          <li>당일 취소와 노쇼는 이용 제한 대상이에요. (1회 경고, 2회 4주 제한, 3회 영구 제한)</li>
          <li>매칭에 실패하면 대체 일정 이동, 이용권 보관, 환불 중에서 고를 수 있어요. 멤버십은 일정 이동 또는 기한 연장 중에서 골라요.</li>
        </ul>
        <label className="flex min-h-11 items-center gap-2.5 text-sm font-semibold">
          <input type="checkbox" name="agree" className="h-5 w-5 accent-stone-900" />
          환불 규정을 확인했어요
        </label>
      </Card>

      <Card>
        <h2 className="text-base font-bold">결제 수단</h2>
        <p className="rounded-lg border-[1.5px] border-dashed border-stone-500 px-3 py-3 text-sm">
          모의 결제 (실제로 청구되지 않아요)
        </p>
      </Card>

      <FormError message={state?.error} />
      <button disabled={pending} className={btnPrimary}>
        {pending ? "결제 중…" : price > 0 ? `${won(price)} 결제하기` : "보유 이용권으로 신청 완료"}
      </button>
    </form>
  );
}
