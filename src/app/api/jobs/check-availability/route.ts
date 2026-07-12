import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { checkJobAvailability } from "@/lib/job-availability";

export const runtime = "nodejs";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL environment variable");
}
const convex = new ConvexHttpClient(convexUrl);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { jobId?: string } | null;
  if (!body?.jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const jobId = body.jobId as Id<"jobs">;
  const data = await convex.query(api.jobs.getJobWithApplication, { jobId });
  if (!data) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const result = await checkJobAvailability(data.job.url);
  await convex.mutation(api.jobs.markAvailability, {
    jobId,
    availabilityStatus: result.status,
    availabilityCheckedAt: result.checkedAt,
    availabilityReason: result.reason,
  });

  return NextResponse.json(result);
}
