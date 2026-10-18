"use server";

import { redirect } from "next/navigation";
import { requireParticipant } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveMembership, getApplication, nextDeadline } from "@/lib/applications";
import { PASS_PRICES } from "@/lib/constants";
import { logStatus } from "@/lib/history";
import { PASS_LABELS, won } from "@/lib/labels";
import { notify } from "@/lib/notify";
import { addMonths, fmtDeadline, todayKST } from "@/lib/time";

export type PayState = { error?: string } | undefined;

const MONTHS: Record<string, number> = { MEMBERSHIP_1M: 1, MEMBERSHIP_3M: 3, MEMBERSHIP_6M: 6 };

// P-4 모의 결제. 실제 청구 없이 결제 상태만 PAID로 바꾼다.
// 같은 신청은 한 번만 결제된다 (payments.application_id 유일 + idempotency_key, PRD 7.3).
export async function payApplication(applicationId: string, _: PayState, formData: FormData): Promise<PayState> {
  const { supabase, profile } = await requireParticipant();
  const app = await getApplication(supabase, applicationId); // RLS: 본인 신청만 보인다
  if (!app || app.profile_id !== profile.id) redirect("/home");
  if (app.application_status !== "SUBMITTED" || app.payment_status !== "PENDING") redirect("/home");

  const deadline = nextDeadline(app);
  if (!deadline) return { error: "신청한 회차의 마감이 지났어요. 이 신청은 취소하고 다른 일정으로 다시 신청해 주세요." };
  if (formData.get("agree") !== "on") return { error: "환불 규정을 확인했다고 체크해 주세요." };

  const choice = String(formData.get("pass") ?? "");
  const admin = createAdminClient();
  let pass: { id: string; type: string; price: number } | null = null;
  let amount = 0;

  if (choice === "OWNED") {
    const owned = await getActiveMembership(supabase, profile.id);
    if (!owned) return { error: "사용할 수 있는 멤버십이 없어요. 이용권을 다시 골라 주세요." };
    pass = owned;
  } else if (choice in PASS_PRICES) {
    amount = PASS_PRICES[choice as keyof typeof PASS_PRICES];
  } else {
    return { error: "이용권을 골라 주세요." };
  }

  // 1) 결제 기록을 먼저 만든다. 이미 있으면(두 번 누름) 중복 결제 없이 홈으로.
  const { data: payment, error: payError } = await admin
    .from("payments")
    .insert({ application_id: app.id, amount, status: "PAID", idempotency_key: `pay-${app.id}` })
    .select("id")
    .single();
  if (payError) {
    if (payError.code === "23505") redirect("/home");
    return { error: "결제를 처리하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  // 2) 새 이용권 발급 (보유 멤버십 사용이면 생략)
  if (!pass) {
    const months = MONTHS[choice];
    const { data: created, error: passError } = await admin
      .from("passes")
      .insert({
        profile_id: profile.id,
        type: choice,
        price: amount,
        valid_until: months ? addMonths(todayKST(), months) : null,
      })
      .select("id, type, price")
      .single();
    if (passError || !created) {
      await admin.from("payments").delete().eq("id", payment.id);
      return { error: "이용권을 발급하지 못했어요. 잠시 후 다시 시도해 주세요." };
    }
    pass = created;
  }

  // 3) 신청에 결제 완료 반영 (아직 결제 대기일 때만)
  await admin
    .from("applications")
    .update({ pass_id: pass!.id, payment_status: "PAID" })
    .eq("id", app.id)
    .eq("payment_status", "PENDING");

  await logStatus(admin, {
    entity: "application", entityId: app.id, field: "payment_status",
    from: "PENDING", to: "PAID", actor: "PARTICIPANT", actorProfileId: profile.id,
    reason: choice === "OWNED" ? `보유 ${PASS_LABELS[pass!.type]} 사용` : `${PASS_LABELS[choice]} 모의 결제 ${won(amount)}`,
  });
  await notify(admin, {
    profileId: profile.id,
    key: "PAYMENT_DONE",
    title: "결제가 완료됐어요",
    body: `${choice === "OWNED" ? `보유 ${PASS_LABELS[pass!.type]}` : `${PASS_LABELS[choice]} ${won(amount)}`} · 자동 매칭은 ${fmtDeadline(deadline)} 이후 진행돼요.`,
    link: "/home",
  });

  redirect("/home");
}
