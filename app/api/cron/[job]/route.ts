import { NextResponse } from "next/server";
import { isJobName, runJob } from "@/modules/jobs";

// Vercel Cron 진입점. Vercel은 CRON_SECRET을 Authorization 헤더로 보낸다.
export async function GET(request: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isJobName(job)) {
    return NextResponse.json({ error: "unknown job" }, { status: 404 });
  }
  const result = await runJob(job, "CRON");
  return NextResponse.json(result, { status: result.ok ? 200 : 202 });
}
