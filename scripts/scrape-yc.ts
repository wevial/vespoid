import { parseYcJobsFromHtml, type YcJobListing } from "../src/lib/yc-jobs";

const YC_JOBS_URL = "https://www.ycombinator.com/jobs";

export async function scrapeYcJobs(): Promise<YcJobListing[]> {
  const response = await fetch(YC_JOBS_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) throw new Error(`YC jobs fetch failed: ${response.status}`);
  const html = await response.text();
  return parseYcJobsFromHtml(html);
}

if (Bun.main === import.meta.path) {
  scrapeYcJobs()
    .then((jobs) => console.log(JSON.stringify({ source: "yc", jobs: jobs.sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0)) }, null, 2)))
    .catch((error) => {
      console.error("YC scraper failed:", error);
      process.exit(1);
    });
}
