"use server";

import { requireAdmin } from "@/lib/auth";
import { isJobName, runJob, type JobResult } from "@/modules/jobs";

// 운영자 시연 도구: 예약 작업을 지금 실행 (시스템_설계.md 6장)
export async function runJobNow(_: JobResult | undefined, formData: FormData): Promise<JobResult | undefined> {
  await requireAdmin();
  const job = String(formData.get("job") ?? "");
  if (!isJobName(job)) return undefined;
  return runJob(job, "ADMIN");
}
