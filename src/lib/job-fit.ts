export interface JobFitInput {
  title: string;
  company: string;
  description?: string;
  salaryRange?: string;
  location?: string;
  remoteStatus?: string;
}

export interface SalaryRange {
  min?: number;
  max?: number;
}

export interface JobFit {
  isRelevant: boolean;
  score: number;
  reasons: string[];
  rejectionReasons: string[];
}

const TARGET_ROLE = /\b(product engineer|full[-\s]?stack|frontend|front[-\s]?end|software engineer|founding engineer|product[-\s]?minded engineer|web engineer|typescript engineer|react engineer|ai engineer)\b/i;
const TARGET_STACK = /\b(type\s*script|javascript|react|next\.?js|node\.?js|go|golang|python|fastapi|django|frontend|front[-\s]?end|web app|full[-\s]?stack)\b/i;
const TARGET_DOMAIN = /\b(ai|llm|agent|developer tool|devtool|dev tools|infrastructure|platform|api|sdk|workflow|automation|internal tools|data platform)\b/i;
const SENIORITY = /\b(senior|staff|lead|principal|founding|founder|architect|8\+? years|7\+? years|experienced)\b/i;
const TARGET_METRO = /\b(seattle|bellevue|redmond|san francisco|sf\b|bay area|palo alto|mountain view|sunnyvale|san mateo|san jose|oakland|berkeley|denver|boulder)\b/i;
const REMOTE = /\b(remote|distributed|work from anywhere|wfh)\b/i;
const ONSITE_OR_HYBRID = /\b(hybrid|onsite|on-site|in[-\s]?office|office)\b/i;
const LOCAL_ONLY = /\b(local candidates only|must be local|applicants must be local|local to the)\b/i;
const NON_JOB = /\b(not hiring|no longer hiring|actively helping|seeking freelancer|seeking work|for hire|contract-to-hire|fractional|consulting only|agency|recruiting agency)\b/i;
const NON_TARGET_ROLE = /\b(marketer|marketing|sales|account executive|customer success|support engineer|designer|product manager|data scientist|machine learning researcher|security analyst|recruiter|intern\b|internship|student)\b/i;
const STAFFING_COMPANY = /\b(robert half|teksystems|kforce|randstad|staffing|recruiting|aquent)\b/i;

function haystack(job: JobFitInput): string {
  return [job.title, job.company, job.location, job.remoteStatus, job.salaryRange, job.description].filter(Boolean).join("\n");
}

export function extractSalaryRange(text?: string): SalaryRange | undefined {
  if (!text || /[£€]/.test(text)) return undefined;
  const salarySnippets = [...text.matchAll(/\$\s*\d{2,3}(?:[,\s]?\d{3})?\s*k?(?:\s*[-–—]\s*\$?\s*\d{2,3}(?:[,\s]?\d{3})?\s*k?)?/gi)].map(
    (match) => match[0],
  );
  if (salarySnippets.length === 0) return undefined;

  const values = salarySnippets.flatMap((snippet) =>
    [...snippet.matchAll(/(\d{2,3})(?:[,\s]?(\d{3}))?\s*(k)?/gi)].map((match) => {
      const whole = Number(match[1]);
      const thousands = match[2];
      const hasK = Boolean(match[3]) || /k/i.test(snippet);
      if (thousands) return whole * 1000 + Number(thousands);
      return hasK || whole < 1000 ? whole * 1000 : whole;
    }),
  );

  return { min: Math.min(...values), max: Math.max(...values) };
}

export function isTargetLocation(location?: string, remoteStatus?: string, description?: string): boolean {
  const explicitLocation = location ?? "";
  const explicitStatus = remoteStatus ?? "";
  const explicit = [explicitLocation, explicitStatus].join(" ");

  if (REMOTE.test(explicit)) return true;
  if (TARGET_METRO.test(explicit)) return true;
  if (ONSITE_OR_HYBRID.test(explicit)) return false;
  if (LOCAL_ONLY.test(description ?? "")) return false;

  return REMOTE.test(description ?? "") || TARGET_METRO.test(description ?? "");
}

export function classifyJobFit(job: JobFitInput): JobFit {
  const text = haystack(job);
  const lowerCompany = job.company.toLowerCase();
  const reasons: string[] = [];
  const rejectionReasons: string[] = [];
  let score = 0;

  if (NON_JOB.test(text) || STAFFING_COMPANY.test(lowerCompany)) {
    return { isRelevant: false, score: 0, reasons, rejectionReasons: ["not a direct job post"] };
  }

  if (TARGET_ROLE.test(text)) {
    score += 4;
    reasons.push("target role");
  } else if (TARGET_STACK.test(text) && /\bengineer|developer|programmer\b/i.test(text)) {
    score += 2;
    reasons.push("engineering role with target stack");
  } else {
    rejectionReasons.push("not target role");
  }

  if (NON_TARGET_ROLE.test(job.title) && !/engineer|developer/i.test(job.title)) {
    score -= 4;
    rejectionReasons.push("not target role");
  }

  if (isTargetLocation(job.location, job.remoteStatus, job.description)) {
    score += 3;
    reasons.push("target location");
  } else {
    rejectionReasons.push("outside target locations");
  }

  if (TARGET_STACK.test(text)) {
    score += 2;
    reasons.push("target stack");
  }

  if (TARGET_DOMAIN.test(text)) {
    score += 2;
    reasons.push("target domain");
  }

  if (SENIORITY.test(text)) {
    score += 1;
    reasons.push("senior fit");
  }

  const salary = extractSalaryRange([job.salaryRange, job.description].filter(Boolean).join(" "));
  if (salary?.max !== undefined) {
    if (salary.max >= 180000) {
      score += 2;
      reasons.push("salary target");
    } else if (salary.max < 170000) {
      score -= 2;
      rejectionReasons.push("below salary target");
    }
  }

  const isRelevant = score >= 7 && !rejectionReasons.includes("not target role") && !rejectionReasons.includes("outside target locations");
  return { isRelevant, score: Math.max(0, score), reasons: [...new Set(reasons)], rejectionReasons: [...new Set(rejectionReasons)] };
}
