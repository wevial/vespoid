import { parseYcJobsFromHtmlPages, type YcJobListing } from "../src/lib/yc-jobs";

const YC_JOB_PATHS = [
  "/jobs",
  "/jobs/role/software-engineer",
  "/jobs/role/software-engineer/remote",
  "/jobs/role/software-engineer/san-francisco",
  "/jobs/location/san-francisco",
  "/jobs/location/seattle",
];

function ycJobsUrl(path: string) {
  return new URL(path, "https://www.ycombinator.com").toString();
}

async function fetchYcJobsHtml(path: string) {
  const response = await fetch(ycJobsUrl(path), {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) throw new Error(`YC jobs fetch failed for ${path}: ${response.status}`);
  return response.text();
}

export async function scrapeYcJobs(): Promise<YcJobListing[]> {
  const htmlPages = await Promise.all(YC_JOB_PATHS.map(fetchYcJobsHtml));
  return parseYcJobsFromHtmlPages(htmlPages);
}

if (Bun.main === import.meta.path) {
  scrapeYcJobs()
    .then((jobs) => console.log(JSON.stringify({ source: "yc", jobs: jobs.sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0)) }, null, 2)))
    .catch((error) => {
      console.error("YC scraper failed:", error);
      process.exit(1);
    });
}
