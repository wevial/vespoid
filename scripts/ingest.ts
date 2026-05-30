import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const CONVEX_URL = process.env.CONVEX_URL;
if (!CONVEX_URL) {
  console.error("CONVEX_URL env var required — set it in .env.local or pass inline");
  process.exit(1);
}

function isSafeHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return ![
      "localhost",
      "127.",
      "0.",
      "10.",
      "169.254.",
      "192.168.",
      "172.16.",
      "172.17.",
      "172.18.",
      "172.19.",
      "172.20.",
      "172.21.",
      "172.22.",
      "172.23.",
      "172.24.",
      "172.25.",
      "172.26.",
      "172.27.",
      "172.28.",
      "172.29.",
      "172.30.",
      "172.31.",
    ].some((prefix) => host === prefix || host.startsWith(prefix));
  } catch {
    return false;
  }
}

const client = new ConvexHttpClient(CONVEX_URL);
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
interface RawJob {
  url?: unknown;
  title?: unknown;
  company?: unknown;
  [key: string]: unknown;
}

interface IngestJob {
  url: string;
  title: string;
  company: string;
  source: "hn" | "wellfound";
  description?: string;
  salaryRange?: string;
  location?: string;
  remoteStatus?: string;
  postedAt?: string;
  [key: string]: unknown;
}

function isSource(value: unknown): value is "hn" | "wellfound" {
  return value === "hn" || value === "wellfound";
}

function isIngestJob(job: RawJob): job is IngestJob {
  return (
    isSafeHttpsUrl(job.url) &&
    typeof job.title === "string" &&
    typeof job.company === "string" &&
    isSource(job.source) &&
    (job.description === undefined || typeof job.description === "string") &&
    (job.salaryRange === undefined || typeof job.salaryRange === "string") &&
    (job.location === undefined || typeof job.location === "string") &&
    (job.remoteStatus === undefined || typeof job.remoteStatus === "string") &&
    (job.postedAt === undefined || typeof job.postedAt === "string")
  );
}

process.stdin.on("end", async () => {
  try {
    const { jobs } = JSON.parse(input) as { jobs?: RawJob[] };
    if (!Array.isArray(jobs)) throw new Error("Expected 'jobs' array in input JSON");

    const validJobs = jobs.filter(isIngestJob);
    const skipped = jobs.length - validJobs.length;
    let count = 0;
    for (const job of validJobs) {
      try {
        await client.mutation(api.jobs.upsertJob, job);
        count++;
      } catch (error) {
        console.error(`Failed to upsert job ${job.url}:`, error);
      }
    }
    console.log(`Upserted ${count} jobs${skipped > 0 ? ` (${skipped} skipped — missing required fields or unsafe URL)` : ""}`);
  } catch (error) {
    console.error("Failed to parse input:", error);
    process.exit(1);
  }
});
