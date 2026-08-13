import { JSDOM } from "jsdom";
import { dedupeAtsJobs, mapAshbyJob, mapGreenhouseJob, mapLeverPosting, type AtsJobListing } from "../src/lib/ats-jobs";
import { classifyJobFit } from "../src/lib/job-fit";
import { refreshPayload, type RefreshPayload } from "../src/lib/refresh-payload";

export interface CompanyBoardConfig {
  slug: string;
  company?: string;
  provider: "ashby" | "lever" | "greenhouse" | "workable";
}

class PartialBoardFailure extends Error {
  constructor(readonly jobs: AtsJobListing[], message: string) {
    super(message);
  }
}

export const CURATED_COMPANY_BOARDS: CompanyBoardConfig[] = [
  { provider: "ashby", slug: "linear", company: "Linear" },
  { provider: "greenhouse", slug: "vercel", company: "Vercel" },
  { provider: "ashby", slug: "supabase", company: "Supabase" },
  { provider: "greenhouse", slug: "anthropic", company: "Anthropic" },
  { provider: "ashby", slug: "openai", company: "OpenAI" },
  { provider: "ashby", slug: "cohere", company: "Cohere" },
  { provider: "workable", slug: "huggingface", company: "Hugging Face" },
  { provider: "lever", slug: "mistral", company: "Mistral" },
  { provider: "greenhouse", slug: "togetherai", company: "Together AI" },
  { provider: "greenhouse", slug: "xai", company: "xAI" },
  { provider: "ashby", slug: "cognition", company: "Cognition" },
  { provider: "ashby", slug: "macroscope", company: "Macroscope" },
  { provider: "ashby", slug: "read-ai", company: "Read AI" },
  { provider: "ashby", slug: "statsig", company: "Statsig" },
  { provider: "ashby", slug: "serval", company: "Serval" },
  { provider: "ashby", slug: "socket", company: "Socket" },
  { provider: "ashby", slug: "motherduck", company: "MotherDuck" },
  { provider: "ashby", slug: "temporal", company: "Temporal" },
  { provider: "ashby", slug: "typesafe-ai", company: "TypeSafe AI" },
  { provider: "lever", slug: "spiceai" },
  { provider: "greenhouse", slug: "gradial" },
  { provider: "greenhouse", slug: "pulumicorporation" },
  { provider: "greenhouse", slug: "seekout" },
  { provider: "lever", slug: "highspot" },
  { provider: "greenhouse", slug: "echodynecorp" },
  { provider: "ashby", slug: "humanly", company: "Humanly" },
  { provider: "greenhouse", slug: "leveltenenergy" },
  { provider: "greenhouse", slug: "truveta" },
  { provider: "greenhouse", slug: "phaidra" },
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
  { provider: "greenhouse", slug: "spacex", company: "SpaceX" },
];

const GREPTILE_CAREER_URLS = [
  "https://www.greptile.com/careers/generalist-engineer",
  "https://www.greptile.com/careers/frontend-engineer",
];

const POSTHOG_CAREER_URLS = [
  "https://posthog.com/careers/product-engineer",
];

const GITHUB_CAREERS_API_URL = "https://www.github.careers/api/jobs?limit=100&page=1&internal=false";
const NOUS_RESEARCH_CAREERS_URL = "https://nousresearch.com/careers";
const NOUS_RESEARCH_ROLE_CARDS = [
  {
    title: "Full Stack Engineer",
    url: "https://nousresearch.com/full-stack-engineer/",
    summary: "Help build Nous Products, end to end.",
  },
  {
    title: "Machine Learning Engineer",
    url: "https://nousresearch.com/machine-learning-engineer-general-training-infrastructure/",
    summary: "Scale training and deployment of large models.",
  },
  {
    title: "Research Scientist",
    url: "https://nousresearch.com/research-scientist/",
    summary: "Work with the Fundamental AI Research Team to produce high-impact AI research.",
  },
  {
    title: "Forward Deployed Engineer",
    url: "https://nousresearch.com/forward-deployed-engineer/",
    summary: "Deploy and adapt Hermes Agent Enterprise inside customer environments.",
  },
  {
    title: "UI/UX Designer",
    url: "https://nousresearch.com/ux-ui-designer/",
    summary: "Design agentic AI experiences across surfaces.",
  },
  {
    title: "General Counsel",
    url: "https://nousresearch.com/general-counsel/",
    summary: "Guide the executive team and manage all legal strategy and operations.",
  },
] as const;

function normalizedText(document: Document): string {
  document.querySelectorAll("script, style").forEach((element) => element.remove());
  return document.body.textContent?.replace(/\s*\n\s*/g, "\n").replace(/[ \t]+/g, " ").trim() ?? "";
}

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

export function mapGitHubCareerJob(value: unknown): AtsJobListing | undefined {
  if (!value || typeof value !== "object") return undefined;
  const wrapped = value as { data?: unknown };
  if (!wrapped.data || typeof wrapped.data !== "object") return undefined;
  const data = wrapped.data as Record<string, unknown>;
  if (data.country_code !== "US") return undefined;

  const slug = typeof data.slug === "string" ? data.slug.trim() : "";
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!slug || !title) return undefined;

  const locationName = typeof data.location_name === "string" ? data.location_name.trim() : "";
  const country = typeof data.country === "string" ? data.country.trim() : "";
  const location = locationName || country || "United States";
  const descriptionHtml = [data.description, data.qualifications, data.responsibilities]
    .filter((part): part is string => typeof part === "string" && Boolean(part.trim()))
    .join("\n");
  const description = normalizedText(new JSDOM(`<body>${descriptionHtml}</body>`).window.document);
  const candidate = {
    url: `https://www.github.careers/careers-home/jobs/${encodeURIComponent(slug)}?lang=en-us`,
    title,
    company: "GitHub",
    source: "company_board" as const,
    description,
    location,
    remoteStatus: /\bremote\b/i.test(location) ? "remote" : undefined,
    postedAt: typeof data.posted_date === "string" ? data.posted_date.trim() || undefined : undefined,
  };
  const fit = classifyJobFit(candidate);
  if (!fit.isRelevant) return undefined;
  return { ...candidate, fitScore: fit.score, fitReasons: fit.reasons };
}

async function scrapeGitHubCareers(): Promise<{ jobs: AtsJobListing[]; failedSources: string[] }> {
  try {
    const response = await fetchJson(GITHUB_CAREERS_API_URL) as { jobs?: unknown };
    const jobs = Array.isArray(response.jobs) ? response.jobs : [];
    return { jobs: jobs.map(mapGitHubCareerJob).filter((job): job is AtsJobListing => Boolean(job)), failedSources: [] };
  } catch (error) {
    console.warn(`Skipped github-careers: ${error instanceof Error ? error.message : String(error)}`);
    return { jobs: [], failedSources: ["github-careers"] };
  }
}

export function mapGreptileCareerPage(url: string, html: string): AtsJobListing | undefined {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const text = normalizedText(document);
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

async function scrapeGreptileCareers(): Promise<{ jobs: AtsJobListing[]; failedSources: string[] }> {
  const settled = await Promise.allSettled(
    GREPTILE_CAREER_URLS.map(async (url) => mapGreptileCareerPage(url, await fetchText(url))),
  );
  const jobs: AtsJobListing[] = [];
  const failedSources: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      if (result.value) jobs.push(result.value);
    } else {
      console.warn(`Skipped greptile-careers:${GREPTILE_CAREER_URLS[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      failedSources.push(`greptile-careers:${index}`);
    }
  });
  return { jobs, failedSources };
}

export function mapPostHogCareerPage(url: string, html: string): AtsJobListing | undefined {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const text = normalizedText(document);
  const title =
    document.querySelector("h1")?.textContent?.trim() ??
    document.title.replace(/\s*-\s*PostHog\s*$/i, "").trim();
  if (!title) return undefined;

  const location = text.match(/Location\s*(.+?)\s*Timezone/i)?.[1]?.trim() || metadataValue(document, text, "Location") || "Remote";
  const candidate = {
    url,
    title,
    company: "PostHog",
    source: "company_board" as const,
    description: text,
    location,
    remoteStatus: /remote/i.test(location) ? "remote" : undefined,
  };
  const fit = classifyJobFit(candidate);
  if (!fit.isRelevant) return undefined;
  return { ...candidate, fitScore: fit.score, fitReasons: fit.reasons };
}

async function scrapePostHogCareers(): Promise<{ jobs: AtsJobListing[]; failedSources: string[] }> {
  const settled = await Promise.allSettled(
    POSTHOG_CAREER_URLS.map(async (url) => mapPostHogCareerPage(url, await fetchText(url))),
  );
  const jobs: AtsJobListing[] = [];
  const failedSources: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      if (result.value) jobs.push(result.value);
    } else {
      console.warn(`Skipped posthog-careers:${POSTHOG_CAREER_URLS[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      failedSources.push(`posthog-careers:${index}`);
    }
  });
  return { jobs, failedSources };
}

export function extractNousResearchRoleLinks(html: string): string[] {
  const dom = new JSDOM(html, { url: NOUS_RESEARCH_CAREERS_URL });
  const document = dom.window.document;
  const roleLinks = [...document.querySelectorAll("a")]
    .filter((link) => link.matches("a.role-link") || link.querySelector(".badge.full-time") !== null || /\bfull\s+time\b/i.test(link.textContent ?? ""))
    .map((link) => link.href)
    .filter((href) => /^https:\/\/nousresearch\.com\//i.test(href) && !/\/careers\/?$/i.test(new URL(href).pathname));
  return [...new Set(roleLinks)];
}

function mapNousResearchRoleSummary(title: string, url: string, summary: string, careersHtml = ""): AtsJobListing | undefined {
  const careersText = careersHtml ? normalizedText(new JSDOM(careersHtml).window.document) : "";
  const remoteContext = /fully\s+remote/i.test(careersText) ? "Nous Research careers page says the team is fully remote." : "Nous Research says its team is fully remote.";
  const candidate = {
    url,
    title,
    company: "Nous Research",
    source: "company_board" as const,
    description: [remoteContext, summary, "Open-source AI, Hermes Agent, agentic AI products, workflows, Python, TypeScript, React, APIs."].join("\n"),
    location: "Remote",
    remoteStatus: "remote",
  };
  const fit = classifyJobFit(candidate);
  if (!fit.isRelevant) return undefined;
  return { ...candidate, fitScore: fit.score, fitReasons: fit.reasons };
}

export function mapNousResearchRolePage(url: string, html: string, careersHtml = ""): AtsJobListing | undefined {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const text = normalizedText(document);
  const title = document.querySelector("h1")?.textContent?.trim() ?? document.title.replace(/\s*-\s*NOUS RESEARCH\s*$/i, "").trim();
  if (!title) return undefined;

  const careersText = careersHtml ? normalizedText(new JSDOM(careersHtml).window.document) : "";
  const remoteContext = /fully\s+remote/i.test(careersText) ? "Nous Research careers page says the team is fully remote." : undefined;
  const candidate = {
    url,
    title,
    company: "Nous Research",
    source: "company_board" as const,
    description: [remoteContext, text].filter((line): line is string => Boolean(line)).join("\n"),
    location: "Remote",
    remoteStatus: "remote",
  };
  const fit = classifyJobFit(candidate);
  if (!fit.isRelevant) return undefined;
  return { ...candidate, fitScore: fit.score, fitReasons: fit.reasons };
}

async function scrapeNousResearchCareers(): Promise<{ jobs: AtsJobListing[]; failedSources: string[] }> {
  let careersHtml = "";
  try {
    careersHtml = await fetchText(NOUS_RESEARCH_CAREERS_URL);
  } catch (error) {
    console.warn(`Skipped live nousresearch careers index: ${error instanceof Error ? error.message : String(error)}`);
    return {
      jobs: NOUS_RESEARCH_ROLE_CARDS
        .map((role) => mapNousResearchRoleSummary(role.title, role.url, role.summary))
        .filter((job): job is AtsJobListing => Boolean(job)),
      failedSources: ["nousresearch-careers:index"],
    };
  }

  const roleLinks = extractNousResearchRoleLinks(careersHtml);
  const settled = await Promise.allSettled(
    roleLinks.map(async (url) => {
      const fallback = NOUS_RESEARCH_ROLE_CARDS.find((role) => role.url === url);
      try {
        return { job: mapNousResearchRolePage(url, await fetchText(url), careersHtml), failed: false };
      } catch (error) {
        if (fallback) {
          return { job: mapNousResearchRoleSummary(fallback.title, fallback.url, fallback.summary, careersHtml), failed: true };
        }
        throw error;
      }
    }),
  );
  const jobs: AtsJobListing[] = [];
  const failedSources: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      if (result.value.job) jobs.push(result.value.job);
      if (result.value.failed) failedSources.push(`nousresearch-careers:${index}`);
    } else {
      console.warn(`Skipped nousresearch-careers:${roleLinks[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      failedSources.push(`nousresearch-careers:${index}`);
    }
  });
  return { jobs, failedSources };
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

function parseMarkdownTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function mapWorkableMarkdownJob(company: string, cells: string[], detailMarkdown = ""): AtsJobListing | undefined {
  const [title, department, location, _type, salary, posted, details] = cells;
  const url = details?.match(/\((https:\/\/[^)]+)\)/)?.[1]?.replace(/\.md$/, "");
  if (!title || !url) return undefined;

  const description = [
    department ? `Department: ${department}` : undefined,
    salary && salary !== "—" ? `Compensation: ${salary}` : undefined,
    detailMarkdown || undefined,
  ]
    .filter((line): line is string => Boolean(line && line.trim()))
    .join("\n");
  const candidate = {
    url,
    title,
    company,
    source: "company_board" as const,
    description,
    salaryRange: salary && salary !== "—" ? salary : undefined,
    location,
    remoteStatus: /\bremote\b/i.test(location) || /\bWorkplace:\*\*\s*remote\b/i.test(detailMarkdown) ? "remote" : undefined,
    postedAt: posted,
  };
  const fit = classifyJobFit(candidate);
  if (!fit.isRelevant) return undefined;
  return { ...candidate, fitScore: fit.score, fitReasons: fit.reasons };
}

async function scrapeWorkable(config: CompanyBoardConfig): Promise<AtsJobListing[]> {
  const indexMarkdown = await fetchText(`https://apply.workable.com/${config.slug}/jobs.md`);
  const rows = indexMarkdown
    .split("\n")
    .filter((line) => /^\|\s*[^-|]/.test(line) && !/^\|\s*Title\s*\|/i.test(line));

  const settled = await Promise.allSettled(
    rows.map(async (row) => {
      const cells = parseMarkdownTableRow(row);
      const detailsUrl = cells[6]?.match(/\((https:\/\/[^)]+)\)/)?.[1];
      const detailMarkdown = detailsUrl ? await fetchText(detailsUrl) : "";
      return mapWorkableMarkdownJob(config.company ?? config.slug, cells, detailMarkdown);
    }),
  );
  const jobs = settled.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
  const failedIndex = settled.findIndex((result) => result.status === "rejected");
  if (failedIndex >= 0) {
    const failed = settled[failedIndex];
    const reason = failed.status === "rejected" ? failed.reason : undefined;
    throw new PartialBoardFailure(jobs, `Workable detail page ${failedIndex} failed: ${reason instanceof Error ? reason.message : String(reason)}`);
  }
  return jobs;
}

async function scrapeBoard(config: CompanyBoardConfig): Promise<AtsJobListing[]> {
  switch (config.provider) {
    case "ashby":
      return scrapeAshby(config);
    case "lever":
      return scrapeLever(config);
    case "greenhouse":
      return scrapeGreenhouse(config);
    case "workable":
      return scrapeWorkable(config);
  }
}

async function runLimited<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      try {
        results[currentIndex] = { status: "fulfilled", value: await worker(items[currentIndex], currentIndex) };
      } catch (reason) {
        results[currentIndex] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function scrapeCompanyBoards(configs = CURATED_COMPANY_BOARDS): Promise<RefreshPayload<AtsJobListing>> {
  const settled = await runLimited(configs, 4, scrapeBoard);
  const jobs: AtsJobListing[] = [];
  const failedSources: string[] = [];
  settled.forEach((result, index) => {
    const config = configs[index];
    if (result.status === "fulfilled") {
      jobs.push(...result.value);
    } else {
      if (result.reason instanceof PartialBoardFailure) jobs.push(...result.reason.jobs);
      console.warn(`Skipped ${config.provider}:${config.slug}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      failedSources.push(`${config.provider}:${config.slug}`);
    }
  });
  for (const result of await Promise.all([scrapeGreptileCareers(), scrapePostHogCareers(), scrapeGitHubCareers(), scrapeNousResearchCareers()])) {
    jobs.push(...result.jobs);
    failedSources.push(...result.failedSources);
  }
  return refreshPayload("company_board", dedupeAtsJobs(jobs).sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0)), failedSources);
}

if (Bun.main === import.meta.path) {
  scrapeCompanyBoards()
    .then((payload) => console.log(JSON.stringify(payload, null, 2)))
    .catch((error) => {
      console.error("Company-board scraper failed:", error);
      process.exit(1);
    });
}
