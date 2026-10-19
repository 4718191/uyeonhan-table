"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { resetLatestRun, runMatching } from "@/modules/matching/run";

export type MonitorState = { ok?: string; error?: string } | undefined;

// 시연: 다음 마감 회차의 자동 매칭을 지금 실행 (실제 운영에서는 마감 시각에 Vercel Cron이 실행)
export async function runNow(): Promise<MonitorState> {
  await requireAdmin();
  const r = await runMatching("ADMIN");
  revalidatePath("/admin/monitor");
  return r.ok ? { ok: r.message } : { error: r.message };
}

// 시연: 가장 최근 매칭을 되돌려 다시 실행할 수 있게 한다
export async function resetRun(): Promise<MonitorState> {
  await requireAdmin();
  const r = await resetLatestRun();
  revalidatePath("/admin/monitor");
  return r.ok ? { ok: r.message } : { error: r.message };
}
