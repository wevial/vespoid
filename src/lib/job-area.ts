export type JobAreaFilter = "all" | "remote" | "sf-bay" | "seattle" | "denver-boulder" | "spain";

export interface AreaFilterJob {
  location?: string;
  remoteStatus?: string;
  fitReasons?: string[];
}

const AREA_PATTERNS: Record<Exclude<JobAreaFilter, "all" | "remote" | "spain">, RegExp> = {
  "sf-bay": /\b(san francisco|sf\b|bay area|palo alto|mountain view|sunnyvale|san mateo|san jose|oakland|berkeley)\b/i,
  seattle: /\b(seattle|bellevue|redmond)\b/i,
  "denver-boulder": /\b(denver|boulder)\b/i,
};

function areaText(job: AreaFilterJob): string {
  return [job.location, job.remoteStatus].filter(Boolean).join(" ");
}

export function matchesJobArea(job: AreaFilterJob, area: JobAreaFilter): boolean {
  if (area === "all") return true;
  const text = areaText(job);
  if (area === "remote") return /\b(remote|distributed|work from anywhere|wfh)\b/i.test(text);
  if (area === "spain") return /\b(spain|madrid|barcelona)\b/i.test(text) || (job.fitReasons ?? []).includes("possible Spain eligibility");
  return AREA_PATTERNS[area].test(text);
}

export function filterJobsByArea<T extends AreaFilterJob>(jobs: readonly T[], area: JobAreaFilter): T[] {
  return jobs.filter((job) => matchesJobArea(job, area));
}
