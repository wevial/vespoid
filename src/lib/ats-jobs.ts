import { JSDOM } from "jsdom";
import { classifyJobFit } from "./job-fit";

export interface AtsJobListing {
  url: string;
  title: string;
  company: string;
  source: "company_board";
  refreshScope?: string;
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
  isRemote?: unknown;
  workplaceType?: unknown;
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
  echodynecorp: "Echodyne",
  huggingface: "Hugging Face",
  linear: "Linear",
  gradial: "Gradial",
  highspot: "Highspot",
  leveltenenergy: "LevelTen Energy",
  modal: "Modal",
  phaidra: "Phaidra",
  perplexity: "Perplexity",
  pulumicorporation: "Pulumi",
  replit: "Replit",
  sentry: "Sentry",
  seekout: "SeekOut",
  spiceai: "Spice AI",
  spacex: "SpaceX",
  supabase: "Supabase",
  togetherai: "Together AI",
  truveta: "Truveta",
  vercel: "Vercel",
  warp: "Warp",
  xai: "xAI",
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

function decodeHtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value
    .replace(/&#(\d+);/g, (_match, codepoint: string) => String.fromCodePoint(Number(codepoint)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, codepoint: string) => String.fromCodePoint(Number.parseInt(codepoint, 16)))
    .replace(/&([a-z]+);/gi, (match, entity: string) => namedEntities[entity.toLowerCase()] ?? match);
}

function htmlToText(value?: string) {
  if (!value) return "";
  return decodeHtmlEntities(
    decodeHtmlEntities(value)
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function remoteStatusFromText(location?: string, ...descriptionParts: Array<string | undefined>) {
  const explicitLocation = location ?? "";
  const descriptionText = descriptionParts.filter(Boolean).join(" ");
  const fullText = [explicitLocation, descriptionText].filter(Boolean).join(" ");

  if (/\b(remote\s+or\s+hybrid|hybrid\s+or\s+remote|hybrid|\d\+?\s+days?\s+(?:in\s+the\s+office|in-office|onsite|on-site)|days?\/week\s+onsite)\b/i.test(fullText)) return "hybrid";
  if (/\b(exclusively\s+based|expected\s+in\s+office|based\s+in\s+our\s+[^.]*office|based\s+out\s+of\s+[^.]*office|onsite|on-site)\b/i.test(fullText)) return "onsite";
  if (/\b(remote|distributed|work from anywhere)\b/i.test(explicitLocation)) return "remote";
  if (/\b(fully\s+remote|remote[-\s]+first|remote\s+(?:role|position|team)|work\s+remotely|distributed\s+team|work from anywhere)\b/i.test(descriptionText)) return "remote";
  if (/\boffice\b/i.test(fullText)) return "onsite";
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
  const workplaceType = optionalString(posting.workplaceType);
  const explicitRemoteStatus = /hybrid/i.test(workplaceType ?? "")
    ? "hybrid"
    : /onsite|on-site|in-office/i.test(workplaceType ?? "")
      ? "onsite"
      : posting.isRemote === true || /remote/i.test(workplaceType ?? "")
        ? "remote"
        : undefined;
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
    remoteStatus: explicitRemoteStatus ?? remoteStatusFromText(location, description),
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
