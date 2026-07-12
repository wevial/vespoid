import { JSDOM } from "jsdom";
import { dedupeAtsJobs, mapAshbyJob, mapGreenhouseJob, mapLeverPosting, type AtsJobListing } from "../src/lib/ats-jobs";
import { classifyJobFit } from "../src/lib/job-fit";

export interface CompanyBoardConfig {
  slug: string;
  company?: string;
  provider: "ashby" | "lever" | "greenhouse" | "workable";
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

async function scrapePostHogCareers(): Promise<AtsJobListing[]> {
  const settled = await Promise.allSettled(
    POSTHOG_CAREER_URLS.map(async (url) => mapPostHogCareerPage(url, await fetchText(url))),
  );
  return settled.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value ? [result.value] : [];
    console.warn(`Skipped posthog-careers:${POSTHOG_CAREER_URLS[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    return [];
  });
}

export function extractNousResearchRoleLinks(html: string): string[] {
  const dom = new JSDOM(html, { url: NOUS_RESEARCH_CAREERS_URL });
  const document = dom.window.document;
  const roleLinks = [...document.querySelectorAll("a")]
    .filter((link) => /\bfull\s*time\b/i.test(link.textContent ?? ""))
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

async function scrapeNousResearchCareers(): Promise<AtsJobListing[]> {
  let careersHtml = "";
  try {
    careersHtml = await fetchText(NOUS_RESEARCH_CAREERS_URL);
  } catch (error) {
    console.warn(`Skipped live nousresearch careers index: ${error instanceof Error ? error.message : String(error)}`);
    return NOUS_RESEARCH_ROLE_CARDS
      .map((role) => mapNousResearchRoleSummary(role.title, role.url, role.summary))
      .filter((job): job is AtsJobListing => Boolean(job));
  }

  const roleLinks = extractNousResearchRoleLinks(careersHtml);
  const settled = await Promise.allSettled(
    roleLinks.map(async (url) => {
      const fallback = NOUS_RESEARCH_ROLE_CARDS.find((role) => role.url === url);
      try {
        return mapNousResearchRolePage(url, await fetchText(url), careersHtml);
      } catch (error) {
        if (fallback) return mapNousResearchRoleSummary(fallback.title, fallback.url, fallback.summary, careersHtml);
        throw error;
      }
    }),
  );
  return settled.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value ? [result.value] : [];
    console.warn(`Skipped nousresearch-careers:${roleLinks[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
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
  return settled.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value ? [result.value] : [];
    console.warn(`Skipped workable:${config.slug}:${index}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    return [];
  });
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

export async function scrapeCompanyBoards(configs = CURATED_COMPANY_BOARDS): Promise<AtsJobListing[]> {
  const settled = await runLimited(configs, 4, scrapeBoard);
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
  jobs.push(...await scrapePostHogCareers());
  jobs.push(...await scrapeNousResearchCareers());
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
