"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

// A-6 예외 처리: 처리 시작 → 처리 완료(조치 메모 필수)
export async function updateException(fd: FormData) {
  const { supabase, profile } = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const to = String(fd.get("to") ?? "");
  const note = String(fd.get("note") ?? "").trim();
  if (to === "IN_PROGRESS") {
    await supabase.from("exception_cases").update({ status: "IN_PROGRESS" }).eq("id", id).eq("status", "OPEN");
  } else if (to === "RESOLVED") {
    if (!note) return;
    await supabase.from("exception_cases")
      .update({ status: "RESOLVED", action_note: note, resolved_by: profile?.id ?? null, resolved_at: new Date().toISOString() })
      .eq("id", id).neq("status", "RESOLVED");
  }
  revalidatePath("/admin/exceptions");
}
