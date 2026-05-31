import { JSDOM } from "jsdom";
import { classifyJobFit } from "./job-fit";

export type BuiltinCity = "seattle" | "san-francisco" | "colorado" | "remote";

export interface BuiltinJobCard {
  title?: unknown;
  company?: unknown;
  location?: unknown;
  url?: unknown;
  description?: unknown;
  salaryRange?: unknown;
  postedAt?: unknown;
}

export interface CityBoardJobListing {
  url: string;
  title: string;
  company: string;
  source: "city_board";
  description: string;
  salaryRange?: string;
  location?: string;
  remoteStatus?: string;
  fitScore?: number;
  fitReasons?: string[];
  postedAt?: string;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function companyName(value: unknown): string | undefined {
  if (typeof value === "string") return optionalString(value);
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return optionalString(record.name) ?? optionalString(record.title);
}

function absoluteBuiltinUrl(value: string) {
  return new URL(value, "https://builtin.com").toString();
}

function remoteStatusFromText(...parts: Array<string | undefined>) {
  const text = parts.filter(Boolean).join(" ");
  if (/\b(remote|distributed|work from anywhere)\b/i.test(text)) return "remote";
  if (/\bhybrid\b/i.test(text)) return "hybrid";
  if (/\b(onsite|on-site|office)\b/i.test(text)) return "onsite";
  return undefined;
}

function cityLocationFallback(city: BuiltinCity) {
  switch (city) {
    case "seattle":
      return "Seattle, WA";
    case "san-francisco":
      return "San Francisco, CA";
    case "colorado":
      return "Denver / Boulder, CO";
    case "remote":
      return "Remote - United States";
  }
}

export function mapBuiltinJobCard(card: BuiltinJobCard, city: BuiltinCity): CityBoardJobListing | undefined {
  const title = optionalString(card.title);
  const company = companyName(card.company);
  const url = optionalString(card.url);
  if (!title || !company || !url) return undefined;

  const location = optionalString(card.location) ?? cityLocationFallback(city);
  const description = optionalString(card.description) ?? "";
  const candidate = {
    url: absoluteBuiltinUrl(url),
    title,
    company,
    source: "city_board" as const,
    description,
    salaryRange: optionalString(card.salaryRange),
    location,
    remoteStatus: remoteStatusFromText(location, description),
    postedAt: optionalString(card.postedAt),
  };
  const fit = classifyJobFit(candidate);
  if (!fit.isRelevant) return undefined;
  return { ...candidate, fitScore: fit.score, fitReasons: fit.reasons };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function looksLikeJobCard(value: Record<string, unknown>): boolean {
  return typeof value.title === "string" && (typeof value.url === "string" || typeof value.applyUrl === "string" || typeof value.href === "string");
}

function normalizeJobCard(value: Record<string, unknown>): BuiltinJobCard | undefined {
  if (!looksLikeJobCard(value)) return undefined;
  const nestedCompany = value.company ?? value.companyName ?? value.organization ?? value.employer;
  return {
    title: value.title,
    company: nestedCompany,
    location: value.location ?? value.locationName ?? value.city,
    url: value.url ?? value.applyUrl ?? value.href,
    description: value.description ?? value.shortDescription ?? value.summary,
    salaryRange: value.salaryRange ?? value.compensation ?? value.salary,
    postedAt: value.postedAt ?? value.datePosted ?? value.createdAt,
  };
}

function collectCards(value: unknown, cards: BuiltinJobCard[] = []): BuiltinJobCard[] {
  if (Array.isArray(value)) {
    for (const item of value) collectCards(item, cards);
    return cards;
  }
  if (!isObject(value)) return cards;

  const card = normalizeJobCard(value);
  if (card) cards.push(card);
  for (const child of Object.values(value)) collectCards(child, cards);
  return cards;
}

function nextDataPayload(html: string): unknown | undefined {
  const dom = new JSDOM(html);
  const script = dom.window.document.querySelector("#__NEXT_DATA__")?.textContent;
  if (!script) return undefined;
  return JSON.parse(script);
}

function parseBuiltinCardsFromDom(html: string): BuiltinJobCard[] {
  const dom = new JSDOM(html);
  return Array.from(dom.window.document.querySelectorAll<HTMLElement>("[data-id='job-card']")).map((element) => {
    const titleAnchor = element.querySelector<HTMLAnchorElement>("[data-id='job-card-title']");
    const companyAnchor = element.querySelector<HTMLElement>("[data-id='company-title'] span, [data-id='company-title']");
    const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const salary = text.match(/\b\d{2,3}K\s*[-–—]\s*\d{2,3}K\s+Annually\b/i)?.[0]?.replace(/\s+Annually\b/i, "");
    return {
      title: titleAnchor?.textContent?.trim(),
      company: companyAnchor?.textContent?.trim(),
      url: titleAnchor?.getAttribute("data-alias") ?? titleAnchor?.getAttribute("href") ?? undefined,
      description: text,
      salaryRange: salary,
    };
  });
}

export function parseBuiltinJobsFromHtml(html: string, city: BuiltinCity): CityBoardJobListing[] {
  const payload = nextDataPayload(html);
  const cards = payload ? collectCards(payload) : parseBuiltinCardsFromDom(html);
  const jobs = cards.map((card) => mapBuiltinJobCard(card, city)).filter((job): job is CityBoardJobListing => Boolean(job));
  return Array.from(new Map(jobs.map((job) => [job.url, job])).values());
}
