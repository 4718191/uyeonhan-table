"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireParticipant } from "@/lib/auth";
import { getApplication } from "@/lib/applications";
import { DEMO_MODE } from "@/lib/demo";
import { logStatus } from "@/lib/history";
import { notify } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayKST } from "@/lib/time";
import { cancelConfirmed } from "@/modules/events/cancel";

export type AttendCancelState = { error?: string } | undefined;

// 확정 후 참석 취소 (본인 신청인지 cancelConfirmed 안에서 다시 확인한다)
export async function cancelAttendance(applicationId: string): Promise<AttendCancelState> {
  const { profile } = await requireParticipant();
  const r = await cancelConfirmed(applicationId, profile.id);
  if (!r.ok) return { error: r.message };
  redirect("/home");
}

// FDB-01 체크인: 행사 당일(시연 모드는 확정 후 언제든) 앱에서 누르면 참석 완료로 기록한다
export async function checkIn(applicationId: string): Promise<AttendCancelState> {
  const { supabase, profile } = await requireParticipant();
  const app = await getApplication(supabase, applicationId);
  if (!app || app.profile_id !== profile.id || app.match_status !== "CONFIRMED" || app.application_status !== "SUBMITTED")
    return { error: "체크인할 수 없는 상태예요." };
  const slot = app.slots.find((s) => s.id === app.confirmed_slot_id);
  if (!slot || slot.status === "CLOSED") return { error: "이미 끝난 모임이에요." };
  if (!DEMO_MODE && slot.event_date !== todayKST()) return { error: "체크인은 모임 당일에 할 수 있어요." };

  const admin = createAdminClient();
  const { data: changed } = await admin.from("applications").update({ attendance_status: "ATTENDED" })
    .eq("id", app.id).eq("attendance_status", "SCHEDULED").select("id");
  if (changed?.length) {
    await logStatus(admin, { entity: "application", entityId: app.id, field: "attendance_status", from: "SCHEDULED", to: "ATTENDED", actor: "PARTICIPANT", actorProfileId: profile.id, reason: "앱 체크인" });
    await notify(admin, { profileId: profile.id, key: "CHECKED_IN", title: "체크인했어요", body: "즐거운 식사 되세요! 식사 후 피드백을 남겨 주시면 다음 매칭에 반영돼요.", link: "/feedback" });
  }
  revalidatePath("/table");
  return undefined;
}
