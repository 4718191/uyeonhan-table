"use client";

import { useActionState, useState } from "react";
import { Card, FormError, OptionBox, btnPrimary } from "@/components/mobile";
import { resolveMatch } from "./actions";

type Slot = { id: string; label: string; note: string };

export function ResolveForm({ applicationId, slots, single, passLabel, refundText, extendText }: {
  applicationId: string;
  slots: Slot[];
  single: boolean;
  passLabel: string;
  refundText: string | null;
  extendText: string | null;
}) {
  const [state, action, pending] = useActionState(resolveMatch.bind(null, applicationId), undefined);
  const [choice, setChoice] = useState(slots.length ? "TRANSFER" : single ? "STORE" : "EXTEND");
  const [slotId, setSlotId] = useState(slots[0]?.id ?? "");
  const submitLabel = { TRANSFER: "이 일정으로 옮기기", STORE: "1회권 보관하기", REFUND: "환불받기", EXTEND: "기한 연장하기" }[choice];

  return (
    <form action={action} className="flex flex-col gap-4">
      {slots.length > 0 && (
        <Card>
          <h2 className="text-base font-bold">추천 일정으로 옮기기</h2>
          <p className="text-sm text-stone-600">기존 결제를 그대로 쓰고, 새 회차의 매칭 대기로 바로 바뀌어요. 추가 결제는 없어요.</p>
          {choice === "TRANSFER" && <input type="hidden" name="choice" value="TRANSFER" />}
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">옮길 일정</legend>
            {slots.map((s) => (
              <OptionBox key={s.id} type="radio" name="slot" value={s.id}
                checked={choice === "TRANSFER" && slotId === s.id} onChange={() => { setSlotId(s.id); setChoice("TRANSFER"); }}>
                <span className="flex flex-col">
                  <span className="font-semibold">{s.label}</span>
                  <span className="text-xs text-stone-600">{s.note}</span>
                </span>
              </OptionBox>
            ))}
          </fieldset>
        </Card>
      )}

      <Card>
        <h2 className="text-base font-bold">{slots.length ? "옮기지 않을게요" : "이렇게 처리할 수 있어요"}</h2>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">다른 해결 방법</legend>
          {single ? (
            <>
              <OptionBox type="radio" name="choice" value="STORE" checked={choice === "STORE"} onChange={() => setChoice("STORE")}>
                <span className="flex flex-col">
                  <span className="font-semibold">1회권 보관</span>
                  <span className="text-xs text-stone-600">다음 신청 때 추가 결제 없이 써요</span>
                </span>
              </OptionBox>
              <OptionBox type="radio" name="choice" value="REFUND" checked={choice === "REFUND"} onChange={() => setChoice("REFUND")}>
                <span className="flex flex-col">
                  <span className="font-semibold">환불{refundText ? ` · ${refundText}` : ""}</span>
                  <span className="text-xs text-stone-600">원결제수단으로 바로 자동 환불돼요 (계좌 입력·승인 대기 없음)</span>
                </span>
              </OptionBox>
            </>
          ) : (
            <OptionBox type="radio" name="choice" value="EXTEND" checked={choice === "EXTEND"} onChange={() => setChoice("EXTEND")}>
              <span className="flex flex-col">
                <span className="font-semibold">{passLabel} 기한 1주 연장</span>
                <span className="text-xs text-stone-600">{extendText ?? "매칭 실패 1회당 1주"} · 멤버십은 회당 환불이 없어요</span>
              </span>
            </OptionBox>
          )}
        </fieldset>
      </Card>

      <FormError message={state?.error} />
      <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "처리 중…" : submitLabel}</button>
    </form>
  );
}
