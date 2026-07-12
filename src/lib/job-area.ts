export type JobAreaFilter = "all" | "remote" | "sf-bay" | "seattle" | "denver-boulder" | "spain";

export interface AreaFilterJob {
  location?: string;
  remoteStatus?: string;
  fitReasons?: string[];
}

const AREA_PATTERNS: Record<Exclude<JobAreaFilter, "all" | "remote" | "spain">, RegExp> = {
  "sf-bay": /\b(san francisco|sf\b|bay area|palo alto|mountain view|sunnyvale|san mateo|san jose|oakland|berkeley)\b/i,
  seattle: /\b(seattle|bellevue|redmond|kirkland|washington state|wa)\b/i,
  "denver-boulder": /\b(denver|boulder)\b/i,
};

const REMOTE_PATTERN = /\b(remote|distributed|work from anywhere|wfh)\b/i;
const BROAD_REMOTE_PATTERN =
  /\b(remote\s*(?:\((?:us|usa|u\.s\.|united states)\)|[-/]?\s*(?:us|usa|u\.s\.|united states|north america))|worldwide|global|anywhere|distributed)\b/i;
const REGION_ONLY_PATTERN = /^\s*(?:us|usa|u\.s\.|united states|north america)\s*$/i;

function areaText(job: AreaFilterJob): string {
  return [job.location, job.remoteStatus].filter(Boolean).join(" ");
}

export function matchesJobArea(job: AreaFilterJob, area: JobAreaFilter): boolean {
  if (area === "all") return true;
  const text = areaText(job);
  if (area === "remote") {
    if (/\b(hybrid|onsite|on-site|in[-\s]?office)\b/i.test(job.remoteStatus ?? "")) return false;
    if (!REMOTE_PATTERN.test(text)) return false;
    if (BROAD_REMOTE_PATTERN.test(text)) return true;
    if (/^\s*remote\s*$/i.test(job.remoteStatus ?? "") && REGION_ONLY_PATTERN.test(job.location ?? "")) return true;
    return /^\s*remote\s*$/i.test(text) || /^\s*remote\s*$/i.test(job.location ?? "") || (!job.location && /^\s*remote\s*$/i.test(job.remoteStatus ?? ""));
  }
  if (area === "spain") return /\b(spain|madrid|barcelona)\b/i.test(text) || (job.fitReasons ?? []).includes("possible Spain eligibility");
  return AREA_PATTERNS[area].test(text);
}

export function filterJobsByArea<T extends AreaFilterJob>(jobs: readonly T[], area: JobAreaFilter): T[] {
  return jobs.filter((job) => matchesJobArea(job, area));
}
