import { chromium, type Browser, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const CONVEX_URL = process.env.CONVEX_URL;
if (!CONVEX_URL) {
  console.error("CONVEX_URL env var required");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);
const CONCURRENCY = 5;

async function checkHnStale(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return true;
    const body = await res.text();
    return /position filled|no longer accepting|this job has been filled|\[dead\]|\[deleted\]/i.test(body);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkUrlStale(url: string, page: Page): Promise<boolean> {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  const status = response?.status() ?? 0;
  const body = (await page.textContent("body")) ?? "";
  return status >= 400 || /position filled|no longer accepting|this job has been filled|page not found/i.test(body);
}

async function checkStale() {
  const jobs = await client.query(api.jobs.listActiveJobs);
  const needsBrowser = jobs.some((job) => job.source !== "hn");
  let browser: Browser | undefined;
  if (needsBrowser) browser = await chromium.launch({ headless: true });

  const staleIds: Id<"jobs">[] = [];
  const errors: string[] = [];

  try {
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      const batch = jobs.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (job) => {
          if (job.source === "hn") {
            if (await checkHnStale(job.url)) staleIds.push(job._id);
            return;
          }
          if (!browser) throw new Error("Browser was not initialized for non-HN stale check");
          const page = await browser.newPage();
          try {
            if (await checkUrlStale(job.url, page)) staleIds.push(job._id);
          } finally {
            await page.close().catch(() => {});
          }
        }),
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === "rejected") {
          errors.push(`${batch[j].url}: ${result.reason}`);
          console.error(`Error checking ${batch[j].url}:`, result.reason);
        }
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  if (staleIds.length > 0) await client.mutation(api.jobs.markStaleBatch, { jobIds: staleIds });
  console.log(`Checked ${jobs.length} jobs, marked ${staleIds.length} as stale`);
  if (errors.length > 0) console.log(`${errors.length} errors encountered during check`);
}

checkStale().catch((error) => {
  console.error("Stale check failed:", error);
  process.exit(1);
});
