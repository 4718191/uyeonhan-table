"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logStatus } from "@/lib/history";
import { notify } from "@/lib/notify";
import { applyRestriction, type Action } from "@/lib/restrictions";

// SAF-02 신고 검토: 경고·참가 제한·영구 제한을 기록한다. 신고자 정보는 피신고자에게 알리지 않는다.
export async function reviewReport(fd: FormData) {
  const { profile } = await requireAdmin();
  const supabase = createAdminClient();
  const id = String(fd.get("id") ?? "");
  const action = String(fd.get("action") ?? "NONE") as Action | "NONE";
  if (!["NONE", "WARNING", "SUSPEND", "BAN"].includes(action)) return;
  const { data: r } = await supabase.from("safety_reports").update({ status: "REVIEWED", action, reviewed_at: new Date().toISOString() })
    .eq("id", id).eq("status", "OPEN").select("id, reporter, reported").maybeSingle();
  if (!r) return;
  await logStatus(supabase, { entity: "safety_report", entityId: r.id, field: "status", from: "OPEN", to: `REVIEWED:${action}`, actor: "ADMIN", actorProfileId: profile?.id, reason: "신고 검토" });
  if (action !== "NONE") await applyRestriction(supabase, r.reported, action, "안전 신고 검토 결과", profile?.id ?? null);
  await notify(supabase, { profileId: r.reporter, key: "REPORT_REVIEWED", title: "신고 검토를 마쳤어요",
    body: "알려 주셔서 고마워요. 운영 정책에 따라 조치했고, 신고한 분과는 앞으로도 같은 테이블에 배정되지 않아요.", link: "/notifications" });
  revalidatePath("/admin/safety");
  revalidatePath("/admin");
}
