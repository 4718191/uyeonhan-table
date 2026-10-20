"use server";

import { revalidatePath } from "next/cache";
import { requireParticipant } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getApplication } from "@/lib/applications";
import { logStatus } from "@/lib/history";
import { won } from "@/lib/labels";
import { notify } from "@/lib/notify";

export type CancelState = { error?: string; done?: string } | undefined;

// 마감 전 신청 취소 (MVP 6장): 아직 테이블이 확정되지 않았으므로 신청 상태를 CANCELED로 바꾼다.
// 1회권은 모의 환불하고, 멤버십은 신청만 취소한다. 결제 전이면 취소만 한다.
export async function cancelApplication(applicationId: string): Promise<CancelState> {
  const { supabase, profile } = await requireParticipant();
  const app = await getApplication(supabase, applicationId);
  if (!app || app.profile_id !== profile.id) return { error: "신청을 찾을 수 없어요." };
  if (app.application_status !== "SUBMITTED" || app.match_status !== "WAITING")
    return { error: "지금은 앱에서 취소할 수 없는 상태예요." };

  const firstDeadline = app.slots.map((s) => s.apply_deadline).sort()[0];
  if (firstDeadline && new Date(firstDeadline) <= new Date())
    return { error: "매칭 마감이 지나 이제는 환불 취소를 할 수 없어요." };

  const admin = createAdminClient();
  // 아직 SUBMITTED일 때만 바꾼다 (두 번 눌러도 환불이 두 번 일어나지 않게)
  const { data: changed } = await admin
    .from("applications")
    .update({ application_status: "CANCELED" })
    .eq("id", app.id)
    .eq("application_status", "SUBMITTED")
    .select("id");
  if (!changed || changed.length === 0) return { done: "이미 취소된 신청이에요." };

  const changes: Parameters<typeof logStatus>[1] = [{
    entity: "application", entityId: app.id, field: "application_status",
    from: "SUBMITTED", to: "CANCELED", actor: "PARTICIPANT", actorProfileId: profile.id, reason: "마감 전 취소",
  }];
  let message = "신청을 취소했어요.";

  if (app.payment_status === "PAID" && app.pass?.type === "SINGLE" && app.payment?.amount === 0) {
    // 보관한 1회권으로 신청했으면 다시 보관한다
    await admin.from("passes").update({ stored: true }).eq("id", app.pass.id);
    message = "신청을 취소하고 1회권을 다시 보관했어요.";
    await notify(admin, { profileId: profile.id, key: "APPLICATION_CANCELED", title: "신청이 취소됐어요", body: message, link: "/home" });
  } else if (app.payment_status === "PAID" && app.pass?.type === "SINGLE" && app.payment) {
    const amount = app.payment.amount;
    await admin
      .from("payments")
      .update({ status: "REFUNDED", refunded_amount: amount, refunded_at: new Date().toISOString() })
      .eq("application_id", app.id)
      .eq("status", "PAID");
    await admin.from("applications").update({ payment_status: "REFUNDED" }).eq("id", app.id);
    changes.push({
      entity: "application", entityId: app.id, field: "payment_status",
      from: "PAID", to: "REFUNDED", actor: "SYSTEM", reason: `마감 전 취소 모의 환불 ${won(amount)}`,
    });
    message = `신청을 취소하고 ${won(amount)}을 환불했어요.`;
    await notify(admin, {
      profileId: profile.id, key: "REFUND_DONE", title: "환불이 완료됐어요",
      body: `${won(amount)} · 처리 상태: 환불 완료 (모의 환불)`, link: "/home",
    });
  } else {
    if (app.payment_status === "PAID") message = "신청을 취소했어요. 멤버십은 그대로 다시 쓸 수 있어요.";
    await notify(admin, {
      profileId: profile.id, key: "APPLICATION_CANCELED", title: "신청이 취소됐어요",
      body: message, link: "/home",
    });
  }

  await logStatus(admin, changes);
  revalidatePath("/home");
  return { done: message };
}
