import { dedupeAtsJobs, mapAshbyJob, mapGreenhouseJob, mapLeverPosting, type AtsJobListing } from "../src/lib/ats-jobs";

interface CompanyBoardConfig {
  slug: string;
  company?: string;
  provider: "ashby" | "lever" | "greenhouse";
}

const CURATED_COMPANY_BOARDS: CompanyBoardConfig[] = [
  { provider: "ashby", slug: "linear", company: "Linear" },
  { provider: "greenhouse", slug: "vercel", company: "Vercel" },
  { provider: "ashby", slug: "supabase", company: "Supabase" },
  { provider: "greenhouse", slug: "anthropic", company: "Anthropic" },
  { provider: "ashby", slug: "cursor", company: "Cursor" },
  { provider: "ashby", slug: "modal", company: "Modal" },
  { provider: "ashby", slug: "warp", company: "Warp" },
  { provider: "ashby", slug: "perplexity", company: "Perplexity" },
  { provider: "ashby", slug: "ashby", company: "Ashby" },
  { provider: "ashby", slug: "replit", company: "Replit" },
  { provider: "ashby", slug: "sentry", company: "Sentry" },
  { provider: "ashby", slug: "render", company: "Render" },
  { provider: "greenhouse", slug: "figma", company: "Figma" },
  { provider: "greenhouse", slug: "tailscale", company: "Tailscale" },
];

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function scrapeAshby(config: CompanyBoardConfig): Promise<AtsJobListing[]> {
  const data = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${config.slug}?includeCompensation=true`) as { jobs?: unknown };
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  return jobs.map((job) => mapAshbyJob(config.slug, job, config.company)).filter((job): job is AtsJobListing => Boolean(job));
}

async function scrapeLever(config: CompanyBoardConfig): Promise<AtsJobListing[]> {
  const data = await fetchJson(`https://api.lever.co/v0/postings/${config.slug}?mode=json`) as unknown;
  const postings = Array.isArray(data) ? data : [];
  return postings.map((posting) => mapLeverPosting(config.slug, posting)).filter((job): job is AtsJobListing => Boolean(job));
}

async function scrapeGreenhouse(config: CompanyBoardConfig): Promise<AtsJobListing[]> {
  const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${config.slug}/jobs?content=true`) as { jobs?: unknown };
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  return jobs.map((job) => mapGreenhouseJob(config.slug, job)).filter((job): job is AtsJobListing => Boolean(job));
}

async function scrapeBoard(config: CompanyBoardConfig): Promise<AtsJobListing[]> {
  switch (config.provider) {
    case "ashby":
      return scrapeAshby(config);
    case "lever":
      return scrapeLever(config);
    case "greenhouse":
      return scrapeGreenhouse(config);
  }
}

export async function scrapeCompanyBoards(configs = CURATED_COMPANY_BOARDS): Promise<AtsJobListing[]> {
  const settled = await Promise.allSettled(configs.map(scrapeBoard));
  const jobs: AtsJobListing[] = [];
  settled.forEach((result, index) => {
    const config = configs[index];
    if (result.status === "fulfilled") {
      jobs.push(...result.value);
    } else {
      console.warn(`Skipped ${config.provider}:${config.slug}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    }
  });
  return dedupeAtsJobs(jobs).sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0));
}

if (Bun.main === import.meta.path) {
  scrapeCompanyBoards()
    .then((jobs) => console.log(JSON.stringify({ source: "company_board", jobs }, null, 2)))
    .catch((error) => {
      console.error("Company-board scraper failed:", error);
      process.exit(1);
    });
}
