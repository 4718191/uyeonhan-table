"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logStatus } from "@/lib/history";
import { notify } from "@/lib/notify";
import { applyRestriction, type Action } from "@/lib/restrictions";

// A-9 노쇼 후보 확인: 운영자는 후보만 보고 노쇼 확정 또는 참석으로 정정한다 (FDB-01)
export async function resolveCandidate(fd: FormData) {
  const { profile } = await requireAdmin();
  const supabase = createAdminClient(); // 운영자 확인 후 서버에서만 쓴다
  const ids = fd.getAll("id").map(String).filter(Boolean);
  const to = String(fd.get("to") ?? "");
  if (!ids.length || !["NO_SHOW", "ATTENDED"].includes(to)) return;
  const { data: changed, error } = await supabase.from("applications").update({ attendance_status: to })
    .in("id", ids).eq("attendance_status", "SCHEDULED").select("id, profile_id");
  if (error) throw new Error(`참석 상태를 바꾸지 못했어요: ${error.message}`);
  if (!changed?.length) return;
  await logStatus(supabase, changed.map((a) => ({
    entity: "application" as const, entityId: a.id, field: "attendance_status", from: "SCHEDULED", to, actor: "ADMIN" as const, actorProfileId: profile?.id,
    reason: to === "NO_SHOW" ? "운영자 노쇼 확정 (체크인 기록 없음)" : "운영자 참석 정정 (현장 확인)",
  })));
  if (to === "NO_SHOW") {
    await notify(supabase, changed.map((a) => ({
      profileId: a.profile_id, key: "NO_SHOW", title: "노쇼로 기록됐어요",
      body: "체크인 기록이 없어 노쇼로 기록됐어요. 1회권은 사용된 것으로 처리되고, 노쇼·당일 취소가 누적되면 이용이 제한돼요.", link: "/history",
    })));
  }
  revalidatePath("/admin/attendance");
  revalidatePath("/admin");
}

// 이용 제한 확정 (SAF-02): 시스템 제안을 보고 운영자가 적용한다
export async function restrict(fd: FormData) {
  const { profile } = await requireAdmin();
  const supabase = createAdminClient();
  const target = String(fd.get("profile") ?? "");
  const action = String(fd.get("action") ?? "") as Action;
  const reason = String(fd.get("reason") ?? "").trim() || "노쇼·당일 취소 누적";
  if (!target || !["WARNING", "SUSPEND", "BAN"].includes(action)) return;
  await applyRestriction(supabase, target, action, reason, profile?.id ?? null);
  revalidatePath("/admin/attendance");
  revalidatePath("/admin/safety");
}

// 제한 해제 (운영자 판단)
export async function liftRestriction(fd: FormData) {
  const { profile } = await requireAdmin();
  const supabase = createAdminClient();
  const target = String(fd.get("profile") ?? "");
  const { data: p } = await supabase.from("profiles").select("restriction_level").eq("id", target).single();
  if (!p) return;
  await supabase.from("profiles").update({ restriction_level: 0, restricted_until: null }).eq("id", target);
  await logStatus(supabase, { entity: "profile", entityId: target, field: "restriction_level", from: String(p.restriction_level), to: "0", actor: "ADMIN", actorProfileId: profile?.id, reason: "운영자 제한 해제" });
  revalidatePath("/admin/attendance");
  revalidatePath("/admin/safety");
}
