"use server";

import { redirect } from "next/navigation";
import { requireParticipant } from "@/lib/auth";
import { cancelConfirmed } from "@/modules/events/cancel";

export type AttendCancelState = { error?: string } | undefined;

// 확정 후 참석 취소 (본인 신청인지 cancelConfirmed 안에서 다시 확인한다)
export async function cancelAttendance(applicationId: string): Promise<AttendCancelState> {
  const { profile } = await requireParticipant();
  const r = await cancelConfirmed(applicationId, profile.id);
  if (!r.ok) return { error: r.message };
  redirect("/home");
}
