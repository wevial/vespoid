import { JSDOM } from "jsdom";
import { dedupeAtsJobs, mapAshbyJob, mapGreenhouseJob, mapLeverPosting, type AtsJobListing } from "../src/lib/ats-jobs";
import { classifyJobFit } from "../src/lib/job-fit";

export interface CompanyBoardConfig {
  slug: string;
  company?: string;
  provider: "ashby" | "lever" | "greenhouse";
}

export const CURATED_COMPANY_BOARDS: CompanyBoardConfig[] = [
  { provider: "ashby", slug: "linear", company: "Linear" },
  { provider: "greenhouse", slug: "vercel", company: "Vercel" },
  { provider: "ashby", slug: "supabase", company: "Supabase" },
  { provider: "greenhouse", slug: "anthropic", company: "Anthropic" },
  { provider: "ashby", slug: "openai", company: "OpenAI" },
  { provider: "ashby", slug: "greptile", company: "Greptile" },
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

const GREPTILE_CAREER_URLS = [
  "https://www.greptile.com/careers/generalist-engineer",
  "https://www.greptile.com/careers/frontend-engineer",
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

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,*/*",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function textAfterLabel(text: string, label: string): string | undefined {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const index = lines.findIndex((line) => line.toLowerCase() === label.toLowerCase());
  return index >= 0 ? lines[index + 1] : undefined;
}

function metadataValue(document: Document, text: string, label: string): string | undefined {
  for (const term of document.querySelectorAll("dt")) {
    if (term.textContent?.trim().toLowerCase() === label.toLowerCase()) {
      const sibling = term.nextElementSibling;
      if (sibling?.tagName.toLowerCase() === "dd") return sibling.textContent?.trim() || undefined;
    }
  }
  const lineValue = textAfterLabel(text, label);
  if (lineValue) return lineValue;

  const compactLabels = ["Location", "Employment Type", "Location Type", "Department", "Compensation"];
  const labelIndex = compactLabels.findIndex((candidate) => candidate.toLowerCase() === label.toLowerCase());
  const nextLabels = compactLabels.slice(labelIndex + 1).map((candidate) => candidate.replace(/\s+/g, "\\s*"));
  const terminator = nextLabels.length > 0 ? `(?:${nextLabels.join("|")})` : "$";
  const match = text.match(new RegExp(`${label.replace(/\s+/g, "\\s*")}(.+?)${terminator}`, "is"));
  return match?.[1]?.trim() || undefined;
}

function normalizedRemoteStatus(locationType?: string): string | undefined {
  if (!locationType) return undefined;
  if (/on[-\s]?site/i.test(locationType)) return "onsite";
  if (/hybrid/i.test(locationType)) return "hybrid";
  if (/remote/i.test(locationType)) return "remote";
  return undefined;
}

export function mapGreptileCareerPage(url: string, html: string): AtsJobListing | undefined {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  document.querySelectorAll("script").forEach((element) => element.remove());
  const text = document.body.textContent?.replace(/\s*\n\s*/g, "\n").replace(/[ \t]+/g, " ").trim() ?? "";
  const title =
    document.querySelector("h1")?.textContent?.trim() ??
    document.title.replace(/\s*-\s*Careers at Greptile\s*$/i, "").trim();
  const location = metadataValue(document, text, "Location");
  const locationType = metadataValue(document, text, "Location Type");
  const department = metadataValue(document, text, "Department");
  const salaryRange = metadataValue(document, text, "Compensation")?.split(title)[0]?.trim();
  if (!title || !location) return undefined;

  const candidate = {
    url,
    title,
    company: "Greptile",
    source: "company_board" as const,
    description: [department ? `Department: ${department}` : undefined, salaryRange ? `Compensation: ${salaryRange}` : undefined, text]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
    salaryRange,
    location,
    remoteStatus: normalizedRemoteStatus(locationType),
  };
  const fit = classifyJobFit(candidate);
  if (!fit.isRelevant) return undefined;
  return { ...candidate, fitScore: fit.score, fitReasons: fit.reasons };
}

async function scrapeGreptileCareers(): Promise<AtsJobListing[]> {
  const settled = await Promise.allSettled(
    GREPTILE_CAREER_URLS.map(async (url) => mapGreptileCareerPage(url, await fetchText(url))),
  );
  return settled.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value ? [result.value] : [];
    console.warn(`Skipped greptile-careers:${GREPTILE_CAREER_URLS[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    return [];
  });
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
  jobs.push(...await scrapeGreptileCareers());
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
