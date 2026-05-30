import { JSDOM } from "jsdom";
import { classifyJobFit } from "../src/lib/job-fit";

export interface JobListing {
  url: string;
  title: string;
  company: string;
  source: "hn";
  description: string;
  salaryRange?: string;
  location?: string;
  remoteStatus?: string;
  fitScore?: number;
  fitReasons?: string[];
  postedAt: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function stripHtml(html: string): string {
  const dom = new JSDOM(html);
  return (dom.window.document.body.textContent ?? "").trim();
}

function decodeHtml(value: string): string {
  return stripHtml(value);
}

interface AlgoliaHit {
  objectID?: string;
  author?: string;
  title?: string;
  created_at: string;
  _tags?: string[];
}

interface AlgoliaSearchResponse {
  hits?: AlgoliaHit[];
}

interface AlgoliaComment {
  id: number;
  text?: string;
  author: string;
  created_at: string;
}

async function findHiringThread(): Promise<string> {
  const now = new Date();
  const searchRes = await fetch("https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=50");
  if (!searchRes.ok) {
    throw new Error(`Algolia search failed: ${searchRes.status}`);
  }
  const searchData = (await searchRes.json()) as AlgoliaSearchResponse;

  for (const monthOffset of [0, -1]) {
    const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const monthName = MONTHS[target.getMonth()].toLowerCase();
    const targetYear = target.getFullYear().toString();
    const thread = searchData.hits?.find((hit) => {
      const title = String(hit.title ?? "").toLowerCase();
      return (
        hit.author === "whoishiring" &&
        hit._tags?.includes("story") &&
        title.includes("who is hiring") &&
        title.includes(monthName) &&
        title.includes(targetYear)
      );
    });
    if (thread?.objectID) return thread.objectID;
  }

  throw new Error(`Could not find current or previous month HN Who's Hiring thread (${MONTHS[now.getMonth()]} ${now.getFullYear()})`);
}

function isEmploymentSegment(value: string): boolean {
  return /^(full[-\s]?time|part[-\s]?time|contract|contractor|internship|temporary|permanent|visa|sponsorship|no visa|remote only)$/i.test(value.trim());
}

function isRoleSegment(value: string): boolean {
  return /\b(engineer|developer|full[-\s]?stack|frontend|front[-\s]?end|backend|product|platform|infrastructure|devops|sre|technical lead|architect)\b/i.test(value);
}

function isLocationSegment(value: string): boolean {
  return /\b(remote|san francisco|sf\b|bay area|seattle|denver|boulder|new york|nyc|austin|berlin|london|paris|palo alto|sunnyvale|mountain view|[A-Z]{2}\b|usa|us|canada|europe|emea|latam)\b/i.test(value);
}

function isUrlSegment(value: string): boolean {
  return /^https?:\/\//i.test(value) || /\.[a-z]{2,}(?:\/|$)/i.test(value);
}

export function extractJobInfo(firstLine: string, text: string, author: string): Omit<JobListing, "source" | "postedAt" | "url"> & { url?: string } {
  const cleanLine = decodeHtml(firstLine.replace(/<[^>]*>/g, ""));
  let company: string;
  let titleSegment: string;

  const pipeSplit = cleanLine.split(" | ");
  if (pipeSplit.length >= 2) {
    company = pipeSplit[0].replace(/\s*\(YC\s*\w+\)\s*$/i, "").trim();
    titleSegment = pipeSplit.slice(1).join(" | ").trim();
  } else {
    const dashMatch = cleanLine.match(/^(.*?)\s+(?:—|–|-)\s+(.*)$/);
    if (dashMatch) {
      company = dashMatch[1].replace(/\s*\(YC\s*\w+\)\s*$/i, "").trim();
      titleSegment = dashMatch[2].trim();
    } else {
      company = author;
      titleSegment = cleanLine;
    }
  }

  if (!company) company = author;
  const titleParts = (pipeSplit.length >= 2 ? pipeSplit.slice(1) : titleSegment.split(/[()]/)).map((part) => part.trim()).filter(Boolean);

  let location: string | undefined;
  let remoteStatus: string | undefined;
  let salaryRange: string | undefined;
  let title: string | undefined;
  let fallbackTitle: string | undefined;

  for (const part of titleParts) {
    const trimmed = part.replace(/\)+$/, "").trim();
    if (isEmploymentSegment(trimmed)) {
      continue;
    }
    if (isUrlSegment(trimmed)) {
      continue;
    }
    if (/remote|hybrid|onsite|in[-\s]?office/i.test(trimmed)) {
      remoteStatus = trimmed.toLowerCase();
    } else if (/\$\d+[kK]|\$\d+,\d+|\$\d+\s*-\s*\$?\d+/i.test(trimmed)) {
      salaryRange = trimmed;
    } else if (!location && isLocationSegment(trimmed) && trimmed.length < 100 && !isRoleSegment(trimmed)) {
      location = trimmed;
    } else if (!title && isRoleSegment(trimmed)) {
      title = trimmed;
    } else if (!fallbackTitle && trimmed.length < 140) {
      fallbackTitle = trimmed;
    }
  }

  title = (title ?? fallbackTitle ?? cleanLine ?? "Untitled role").slice(0, 200).trim();

  const hrefMatch = text.match(/href="(https:\/\/(?!news\.ycombinator\.com)[^"]+)"/i);
  const url = hrefMatch ? decodeHtml(hrefMatch[1]) : undefined;
  const description = stripHtml(text);
  return { url, title, company, description, salaryRange, location, remoteStatus };
}

export function filterJobs(jobs: JobListing[]): JobListing[] {
  const excludePatterns = /robert half|teksystems|kforce|randstad|staffing|recruiting|aquent/i;
  return jobs
    .map((job) => {
      const fit = classifyJobFit(job);
      return { ...job, fitScore: fit.score, fitReasons: fit.reasons };
    })
    .filter((job) => !excludePatterns.test(job.company) && classifyJobFit(job).isRelevant)
    .sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0));
}

export async function scrapeHN(): Promise<JobListing[]> {
  const threadId = await findHiringThread();
  const res = await fetch(`https://hn.algolia.com/api/v1/items/${threadId}`);
  if (!res.ok) throw new Error(`HN items fetch failed: ${res.status}`);
  const data = (await res.json()) as { children?: AlgoliaComment[] };
  const comments: AlgoliaComment[] = data.children ?? [];

  return comments
    .filter((comment): comment is AlgoliaComment & { text: string } => Boolean(comment.text) && comment.author !== "whoishiring")
    .map((comment) => {
      const text = comment.text;
      const firstLineHtml = text.split(/<p>/i)[0] ?? "";
      const firstLine = firstLineHtml.replace(/<[^>]*>/g, "");
      const info = extractJobInfo(firstLine, text, comment.author);
      const listingUrl = info.url ?? `https://news.ycombinator.com/item?id=${comment.id}`;
      return {
        ...info,
        url: listingUrl,
        source: "hn" as const,
        postedAt: new Date(comment.created_at).toISOString(),
      };
    });
}

if (Bun.main === import.meta.path) {
  scrapeHN()
    .then((jobs) => console.log(JSON.stringify({ source: "hn", jobs: filterJobs(jobs) }, null, 2)))
    .catch((error) => {
      console.error("HN scraper failed:", error);
      process.exit(1);
    });
}
