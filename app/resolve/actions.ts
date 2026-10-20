"use server";

import { redirect } from "next/navigation";
import { requireParticipant } from "@/lib/auth";
import { getApplication } from "@/lib/applications";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { logStatus, type StatusChange } from "@/lib/history";
import { won } from "@/lib/labels";
import { notify } from "@/lib/notify";
import { fmtDeadline, fmtEventDate, fmtTime } from "@/lib/time";
import { membershipEnd } from "@/lib/applications";

export type ResolveState = { error?: string } | undefined;
type Choice = "TRANSFER" | "STORE" | "REFUND" | "EXTEND";

// P-6 매칭 실패 해결 (STA-05·06, PAY-03): 참가자가 고른 방법을 운영자 승인 없이 바로 처리한다.
// match_resolutions를 PENDING → DONE으로 먼저 바꾼 사람만 처리하므로, 두 번 눌러도 이동·환불·연장이 두 번 일어나지 않는다 (PRD 7.3).
export async function resolveMatch(applicationId: string, _: ResolveState, formData: FormData): Promise<ResolveState> {
  const { supabase, profile } = await requireParticipant();
  const app = await getApplication(supabase, applicationId);
  if (!app || app.profile_id !== profile.id) redirect("/home");
  if (!["ALTERNATIVE_OFFERED", "NO_MATCH"].includes(app.match_status)) redirect("/home");

  const choice = String(formData.get("choice") ?? "") as Choice;
  const single = app.pass?.type === "SINGLE";
  const allowed: Choice[] = single ? ["TRANSFER", "STORE", "REFUND"] : ["TRANSFER", "EXTEND"];
  if (!allowed.includes(choice)) return { error: "해결 방법을 골라 주세요." };

  const admin = createAdminClient();
  const { data: res } = await admin.from("match_resolutions").select("id, recommended_slot_ids, status").eq("application_id", app.id).maybeSingle();
  if (!res || res.status !== "PENDING") redirect("/home");

  // 일정 이동은 추천 회차 중 아직 마감 전인 것만
  let slot: { id: string; event_date: string; start_time: string; region: string; match_at: string } | null = null;
  if (choice === "TRANSFER") {
    const slotId = String(formData.get("slot") ?? "");
    if (app.match_status !== "ALTERNATIVE_OFFERED" || !(res.recommended_slot_ids as string[]).includes(slotId))
      return { error: "옮길 일정을 골라 주세요." };
    const { data } = await admin.from("event_slots").select("id, event_date, start_time, region, match_at, status").eq("id", slotId).maybeSingle();
    if (!data || data.status !== "OPEN" || new Date(data.match_at) <= new Date())
      return { error: "그 일정은 마감됐어요. 다른 방법을 골라 주세요." };
    slot = data;
  }

  // 선점: PENDING일 때만 DONE으로 (중복 처리 방지)
  const now = new Date().toISOString();
  const { data: claimed } = await admin.from("match_resolutions")
    .update({ status: "DONE", choice, resolved_at: now }).eq("id", res.id).eq("status", "PENDING").select("id");
  if (!claimed || claimed.length === 0) redirect("/home");
  const undo = () => admin.from("match_resolutions").update({ status: "PENDING", choice: null, resolved_at: null }).eq("id", res.id);

  const changes: StatusChange[] = [];
  const by = { actor: "PARTICIPANT" as const, actorProfileId: profile.id };
  const fromPay = app.payment_status;
  let title = "";
  let body = "";

  try {
    if (choice === "TRANSFER" && slot) {
      const label = `${fmtEventDate(slot.event_date)} ${fmtTime(slot.start_time)} ${REGIONS[slot.region as RegionCode]}`;
      await must(admin.from("application_slots").upsert({ application_id: app.id, slot_id: slot.id }, { onConflict: "application_id,slot_id", ignoreDuplicates: true }));
      // 기존 결제를 그대로 유지한다 (새 결제 없음, STA-06·PRD 7.3)
      await must(admin.from("applications").update({
        match_status: "TRANSFERRED", confirmed_slot_id: null, payment_status: "PAID",
        placement_reason: `${app.placement_reason ?? "매칭 실패"} → 참가자가 ${label}(으)로 일정 이동`,
      }).eq("id", app.id));
      if (fromPay === "REFUND_AVAILABLE") await must(admin.from("payments").update({ status: "PAID" }).eq("application_id", app.id).eq("status", "REFUND_AVAILABLE"));
      changes.push({ entity: "application", entityId: app.id, field: "match_status", from: app.match_status, to: "TRANSFERRED", ...by, reason: `대체 일정 이동: ${label}` });
      if (fromPay !== "PAID") changes.push({ entity: "application", entityId: app.id, field: "payment_status", from: fromPay, to: "PAID", ...by, reason: "일정 이동으로 기존 결제 유지" });
      title = "일정을 옮겼어요";
      body = `${label} 회차로 옮겼어요. 기존 결제를 그대로 쓰고, ${fmtDeadline(slot.match_at)} 이후 자동 매칭돼요.`;
    } else if (choice === "STORE") {
      await must(admin.from("passes").update({ stored: true }).eq("id", app.pass!.id));
      await must(admin.from("applications").update({ match_status: "NO_MATCH", payment_status: "PAID", placement_reason: `${app.placement_reason ?? "매칭 실패"} → 1회권 보관` }).eq("id", app.id));
      if (fromPay === "REFUND_AVAILABLE") await must(admin.from("payments").update({ status: "PAID" }).eq("application_id", app.id).eq("status", "REFUND_AVAILABLE"));
      changes.push({ entity: "application", entityId: app.id, field: "match_status", from: app.match_status, to: "NO_MATCH", ...by, reason: "이용권 보관 선택" });
      if (fromPay !== "PAID") changes.push({ entity: "application", entityId: app.id, field: "payment_status", from: fromPay, to: "PAID", ...by, reason: "1회권 보관 (다음 신청에 사용)" });
      title = "1회권을 보관했어요";
      body = "다음에 신청할 때 결제 단계에서 보관한 1회권을 추가 결제 없이 쓸 수 있어요.";
    } else if (choice === "REFUND") {
      const amount = app.payment?.amount ?? 0;
      // 모의 자동 환불 (PAY-03): 환불 요청 → 처리 → 완료를 바로 진행한다
      await must(admin.from("payments").update({ status: "REFUNDED", refunded_amount: amount, refunded_at: now }).eq("application_id", app.id).in("status", ["PAID", "REFUND_AVAILABLE"]));
      await must(admin.from("applications").update({ match_status: "NO_MATCH", payment_status: "REFUNDED", placement_reason: `${app.placement_reason ?? "매칭 실패"} → 환불 ${won(amount)}` }).eq("id", app.id));
      changes.push(
        { entity: "application", entityId: app.id, field: "match_status", from: app.match_status, to: "NO_MATCH", ...by, reason: "환불 선택" },
        { entity: "application", entityId: app.id, field: "payment_status", from: fromPay, to: "REFUND_REQUESTED", ...by, reason: "매칭 실패로 환불 요청" },
        { entity: "application", entityId: app.id, field: "payment_status", from: "REFUND_REQUESTED", to: "REFUNDED", actor: "SYSTEM", reason: `원결제수단 모의 자동 환불 ${won(amount)}` },
      );
      title = "환불이 완료됐어요";
      body = `${won(amount)} · 원결제수단으로 자동 환불했어요. (모의 환불)`;
    } else if (choice === "EXTEND") {
      const pass = app.pass!;
      await must(admin.from("passes").update({ extension_weeks: pass.extension_weeks + 1 }).eq("id", pass.id).eq("extension_weeks", pass.extension_weeks));
      const end = membershipEnd({ valid_until: pass.valid_until, extension_weeks: pass.extension_weeks + 1 });
      await must(admin.from("applications").update({ match_status: "NO_MATCH", placement_reason: `${app.placement_reason ?? "매칭 실패"} → 멤버십 1주 연장` }).eq("id", app.id));
      changes.push({ entity: "application", entityId: app.id, field: "match_status", from: app.match_status, to: "NO_MATCH", ...by, reason: `멤버십 기한 1주 연장${end ? ` (${fmtEventDate(end)}까지)` : ""}` });
      title = "멤버십 기한을 연장했어요";
      body = `매칭 실패 1회로 이용 기한을 1주 늘렸어요.${end ? ` 이제 ${fmtEventDate(end)}까지 쓸 수 있어요.` : ""}`;
    }
  } catch {
    await undo();
    return { error: "처리하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  await logStatus(admin, changes);
  await notify(admin, { profileId: profile.id, key: `RESOLVE_${choice}`, title, body, link: "/home" });
  redirect("/home");
}

async function must(p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p;
  if (error) throw new Error(error.message);
}

