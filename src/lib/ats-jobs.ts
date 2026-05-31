import { JSDOM } from "jsdom";
import { classifyJobFit } from "./job-fit";

export interface AtsJobListing {
  url: string;
  title: string;
  company: string;
  source: "company_board";
  description: string;
  salaryRange?: string;
  location?: string;
  remoteStatus?: string;
  fitScore?: number;
  fitReasons?: string[];
  postedAt?: string;
}

export interface AshbyJob {
  title?: unknown;
  location?: unknown;
  department?: unknown;
  jobUrl?: unknown;
  descriptionHtml?: unknown;
  descriptionPlain?: unknown;
  compensation?: unknown;
  publishedAt?: unknown;
}

export interface LeverPosting {
  text?: unknown;
  hostedUrl?: unknown;
  categories?: {
    team?: unknown;
    location?: unknown;
    commitment?: unknown;
  };
  descriptionPlain?: unknown;
  description?: unknown;
  lists?: unknown;
  createdAt?: unknown;
}

export interface GreenhouseJob {
  title?: unknown;
  absolute_url?: unknown;
  location?: { name?: unknown };
  content?: unknown;
  departments?: { name?: unknown }[];
  updated_at?: unknown;
}

const COMPANY_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  ashby: "Ashby",
  cursor: "Cursor",
  linear: "Linear",
  modal: "Modal",
  perplexity: "Perplexity",
  replit: "Replit",
  supabase: "Supabase",
  vercel: "Vercel",
  warp: "Warp",
};

function titleCaseSlug(slug: string) {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function companyNameFromSlug(slug: string) {
  return COMPANY_NAMES[slug] ?? titleCaseSlug(slug);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function htmlToText(value?: string) {
  if (!value) return "";
  return new JSDOM(value).window.document.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function remoteStatusFromText(...parts: Array<string | undefined>) {
  const text = parts.filter(Boolean).join(" ");
  if (/\b(remote|distributed|work from anywhere)\b/i.test(text)) return "remote";
  if (/\bhybrid\b/i.test(text)) return "hybrid";
  if (/\b(onsite|on-site|office)\b/i.test(text)) return "onsite";
  return undefined;
}

function compensationSummary(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return optionalString(record.compensationTierSummary) ?? optionalString(record.summary) ?? optionalString(record.salaryRange);
}

function leverListsText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .flatMap((list) => {
      if (!list || typeof list !== "object") return [];
      const record = list as Record<string, unknown>;
      const heading = optionalString(record.text);
      const content = Array.isArray(record.content) ? record.content.filter((item): item is string => typeof item === "string") : [];
      return [heading, ...content];
    })
    .filter((item): item is string => Boolean(item))
    .join("\n");
}

function maybeRelevant(candidate: Omit<AtsJobListing, "fitScore" | "fitReasons">): AtsJobListing | undefined {
  const fit = classifyJobFit(candidate);
  if (!fit.isRelevant) return undefined;
  return { ...candidate, fitScore: fit.score, fitReasons: fit.reasons };
}

export function mapAshbyJob(boardSlug: string, posting: AshbyJob, companyOverride?: string): AtsJobListing | undefined {
  const title = optionalString(posting.title);
  const url = optionalString(posting.jobUrl);
  if (!title || !url) return undefined;

  const location = optionalString(posting.location);
  const salaryRange = compensationSummary(posting.compensation);
  const description = [
    optionalString(posting.department) ? `Department: ${optionalString(posting.department)}` : undefined,
    salaryRange ? `Compensation: ${salaryRange}` : undefined,
    optionalString(posting.descriptionPlain) ?? htmlToText(optionalString(posting.descriptionHtml)),
  ]
    .filter((line): line is string => Boolean(line && line.trim()))
    .join("\n");

  return maybeRelevant({
    url,
    title,
    company: companyOverride ?? companyNameFromSlug(boardSlug),
    source: "company_board",
    description,
    salaryRange,
    location,
    remoteStatus: remoteStatusFromText(location, description),
    postedAt: optionalString(posting.publishedAt),
  });
}

export function mapLeverPosting(companySlug: string, posting: LeverPosting): AtsJobListing | undefined {
  const title = optionalString(posting.text);
  const url = optionalString(posting.hostedUrl);
  if (!title || !url) return undefined;

  const location = optionalString(posting.categories?.location);
  const team = optionalString(posting.categories?.team);
  const description = [
    team ? `Team: ${team}` : undefined,
    optionalString(posting.categories?.commitment) ? `Commitment: ${optionalString(posting.categories?.commitment)}` : undefined,
    optionalString(posting.descriptionPlain) ?? htmlToText(optionalString(posting.description)),
    leverListsText(posting.lists),
  ]
    .filter((line): line is string => Boolean(line && line.trim()))
    .join("\n");

  return maybeRelevant({
    url,
    title,
    company: companyNameFromSlug(companySlug),
    source: "company_board",
    description,
    location,
    remoteStatus: remoteStatusFromText(location, description),
    postedAt: typeof posting.createdAt === "number" ? new Date(posting.createdAt).toISOString() : undefined,
  });
}

export function mapGreenhouseJob(companySlug: string, posting: GreenhouseJob): AtsJobListing | undefined {
  const title = optionalString(posting.title);
  const url = optionalString(posting.absolute_url);
  if (!title || !url) return undefined;

  const location = optionalString(posting.location?.name);
  const department = posting.departments?.map((dept) => optionalString(dept.name)).filter(Boolean).join(", ");
  const description = [department ? `Department: ${department}` : undefined, htmlToText(optionalString(posting.content))]
    .filter((line): line is string => Boolean(line && line.trim()))
    .join("\n");

  return maybeRelevant({
    url,
    title,
    company: companyNameFromSlug(companySlug),
    source: "company_board",
    description,
    location,
    remoteStatus: remoteStatusFromText(location, description),
    postedAt: optionalString(posting.updated_at),
  });
}

export function dedupeAtsJobs(jobs: AtsJobListing[]): AtsJobListing[] {
  return Array.from(new Map(jobs.map((job) => [job.url, job])).values());
}
