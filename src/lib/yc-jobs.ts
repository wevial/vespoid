import { JSDOM } from "jsdom";
import { classifyJobFit } from "./job-fit";

export interface YcJobListing {
  url: string;
  title: string;
  company: string;
  source: "yc";
  description: string;
  salaryRange?: string;
  location?: string;
  remoteStatus?: string;
  fitScore?: number;
  fitReasons?: string[];
  postedAt?: string;
}

interface YcJobPosting {
  id?: unknown;
  title?: unknown;
  url?: unknown;
  location?: unknown;
  type?: unknown;
  prettyRole?: unknown;
  roleSpecificType?: unknown;
  salaryRange?: unknown;
  equityRange?: unknown;
  minExperience?: unknown;
  visa?: unknown;
  skills?: unknown;
  companyName?: unknown;
  companyBatchName?: unknown;
  companyOneLiner?: unknown;
  createdAt?: unknown;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function absoluteYcUrl(value: string) {
  return new URL(value, "https://www.ycombinator.com").toString();
}

function remoteStatusFromLocation(location?: string) {
  if (!location) return undefined;
  return /\bremote\b/i.test(location) ? "remote" : undefined;
}

function descriptionFromPosting(posting: YcJobPosting) {
  const lines = [
    optionalString(posting.companyOneLiner),
    [optionalString(posting.prettyRole), optionalString(posting.roleSpecificType)].filter(Boolean).join(", "),
    optionalString(posting.minExperience) ? `Experience: ${optionalString(posting.minExperience)}` : undefined,
    optionalString(posting.visa) ? `Visa: ${optionalString(posting.visa)}` : undefined,
    optionalString(posting.equityRange) ? `Equity: ${optionalString(posting.equityRange)}` : undefined,
    stringArray(posting.skills).length > 0 ? `Skills: ${stringArray(posting.skills).join(", ")}` : undefined,
    optionalString(posting.companyBatchName) ? `YC ${optionalString(posting.companyBatchName)}` : undefined,
  ].filter((line): line is string => Boolean(line && line.trim()));
  return lines.join("\n");
}

export function mapYcJobPosting(posting: YcJobPosting): YcJobListing | undefined {
  const title = optionalString(posting.title);
  const company = optionalString(posting.companyName);
  const relativeUrl = optionalString(posting.url);
  if (!title || !company || !relativeUrl) return undefined;

  const location = optionalString(posting.location);
  const salaryRange = optionalString(posting.salaryRange);
  const description = descriptionFromPosting(posting);
  const candidate = {
    url: absoluteYcUrl(relativeUrl),
    title,
    company,
    source: "yc" as const,
    description,
    salaryRange,
    location,
    remoteStatus: remoteStatusFromLocation(location),
    postedAt: optionalString(posting.createdAt),
  };
  const fit = classifyJobFit(candidate);
  if (!fit.isRelevant) return undefined;
  return { ...candidate, fitScore: fit.score, fitReasons: fit.reasons };
}

function dataPagePayloads(html: string) {
  const dom = new JSDOM(html);
  return Array.from(dom.window.document.querySelectorAll<HTMLElement>("[data-page]"))
    .map((element) => element.getAttribute("data-page"))
    .filter((payload): payload is string => Boolean(payload));
}

export function parseYcJobsFromHtml(html: string): YcJobListing[] {
  for (const payload of dataPagePayloads(html)) {
    const parsed = JSON.parse(payload) as { props?: { jobPostings?: unknown } };
    const postings = parsed.props?.jobPostings;
    if (!Array.isArray(postings)) continue;
    return postings.map(mapYcJobPosting).filter((job): job is YcJobListing => Boolean(job));
  }
  throw new Error("Could not find YC jobPostings data-page payload");
}

export function parseYcJobsFromHtmlPages(htmlPages: string[]): YcJobListing[] {
  const jobsByUrl = new Map<string, YcJobListing>();
  for (const html of htmlPages) {
    for (const job of parseYcJobsFromHtml(html)) {
      if (!jobsByUrl.has(job.url)) jobsByUrl.set(job.url, job);
    }
  }
  return Array.from(jobsByUrl.values());
}
