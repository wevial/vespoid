import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { checkJobAvailability } from "@/lib/job-availability";
import { accessAssertionFromHeaders } from "@/lib/cloudflare-access";

export const runtime = "nodejs";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL environment variable");
}
const configuredConvexUrl: string = convexUrl;
export async function POST(request: NextRequest) {
  const assertion = accessAssertionFromHeaders(request.headers);
  if (!assertion) {
    return NextResponse.json({ error: "Cloudflare Access identity is required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { jobId?: string } | null;
  if (!body?.jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const jobId = body.jobId as Id<"jobs">;
  const convex = new ConvexHttpClient(configuredConvexUrl, { auth: assertion });
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
