import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { serveReviewDataset } from "@/lib/review-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=0;
export async function GET(request: Request) {
 return serveReviewDataset(request.headers,async assertion=>{
  const url=process.env.NEXT_PUBLIC_CONVEX_URL;
  if(!url)throw new Error("Backend authorization is unavailable");
  // Existing query validates RS256, issuer, pinned audience AND owner/service identity.
  // This is strictly a read, not a new auth interpretation or an application mutation.
  const convex=new ConvexHttpClient(url,{auth:assertion});
  await convex.query(api.jobs.statusCounts,{});
 },async()=> (await import("@/server/review-dataset.json")).default);
}
