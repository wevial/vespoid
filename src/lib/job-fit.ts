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

const TARGET_ROLE =
  /\b(product engineer|full[-\s]?stack|frontend|front[-\s]?end|software engineer|founding engineer|forward deployed engineer|product[-\s]?minded engineer|web engineer|typescript engineer|react engineer|ai engineer)\b/i;
const GENERALIST_ENGINEERING_ROLE = /\bgeneralist engineer\b/i;
const TARGET_STACK =
  /\b(type\s*script|javascript|react|next\.?js|node\.?js|go|golang|python|fastapi|django|frontend|front[-\s]?end|web app|full[-\s]?stack)\b/i;
const TARGET_DOMAIN =
  /\b(ai|llm|agent|developer tool|devtool|dev tools|code review|code reviewer|pull requests?|infrastructure|platform|api|sdk|workflow|automation|internal tools|data platform|space|aerospace|satellite|satellites|spacecraft|rocket|rockets|starship|starlink)\b/i;
const SENIORITY = /\b(senior|staff|lead|principal|founding|founder|architect|8\+? years|7\+? years|experienced)\b/i;
const SENIORITY_REACH_TITLE = /\b(?:senior\s+staff|principal)\b|\bstaff\+/i;
const EXCEPTIONAL_REACH_TITLE = /\b(?:senior\s+staff|principal)\b/i;
const OUTSIDE_SENIORITY_TITLE = /\b(?:architect|director|vice[-\s]+president|vp|cto|chief technology officer)\b/i;
const TARGET_METRO =
  /\b(seattle|bellevue|redmond|san francisco|sf\b|bay area|palo alto|mountain view|sunnyvale|san mateo|san jose|oakland|berkeley|denver|boulder)\b/i;
const WASHINGTON_PREFERRED = /\b(seattle|bellevue|redmond|kirkland|washington state|wa\b)\b/i;
const DENVER_METRO = /\b(denver|boulder)\b/i;
const REMOTE = /\b(remote|distributed|work from anywhere|wfh)\b/i;
const ONSITE_OR_HYBRID = /\b(hybrid|onsite|on-site|in[-\s]?office|office)\b/i;
const LOCAL_ONLY = /\b(local candidates only|must be local|applicants must be local|local to the)\b/i;
const OUTSIDE_US_AUTHORIZATION = new RegExp(
  [
    "\\b(eu|europe|emea|apac|uk|united kingdom|canada|canadian|australia|new zealand|aus/nz)\\s*(only|based|required|applicants)\\b",
    "\\bonly\\s*(in\\s*)?(eu|europe|emea|apac|uk|united kingdom|canada|australia|new zealand|aus/nz)\\b",
    "\\bmust be based in (eu|europe|emea|apac|uk|united kingdom|canada|australia|new zealand)\\b",
    "\\bremote\\s+(eu|europe|emea|apac|uk|united kingdom|canada|australia|new zealand|aus/nz)\\s+only\\b",
  ].join("|"),
  "i",
);
const NON_US_REGION =
  /\b(eu|europe|emea|apac|uk|united kingdom|canada|canadian|australia|new zealand|aus\/nz|india|france|spain|madrid|barcelona|singapore|abu dhabi|montreal|toronto|ottawa|london|paris|montpellier|amsterdam|berlin|zurich|munich|prague|skopje|helsinki|cet|cest)\b|\butc\s*[+-]\s*\d{1,2}\b/i;
const US_ELIGIBLE_REGION = /\b(us|u\.s\.|usa|u\.s\.a\.|united states|north america|worldwide|global|anywhere)\b/i;
const NON_JOB = /\b(not hiring|no longer hiring|actively helping|seeking freelancer|seeking work|for hire|contract-to-hire|fractional|consulting only|staffing agency|recruiting agency)\b/i;
const NON_TARGET_ROLE = /\b(marketer|marketing|sales|account executive|customer success|support engineer|design engineer|designer|product manager|data scientist|machine learning researcher|security analyst|recruiter|intern\b|internship|student)\b/i;
const MOBILE_PLATFORM_ROLE = /\b(ios|android|mobile|react native|swift|kotlin)\b/i;
const EMBEDDED_HARDWARE_ROLE = /\b(embedded(?!\s+in\b)|firmware|kernel|device driver|connectivity|bluetooth|ble\b|wi[-\s]?fi|wireless|consumer devices?|hardware[-\s]?in[-\s]?the[-\s]?loop|flight software|rf software|avionics|power systems controls?|control systems?|hardware accelerators?|accelerator platforms?)\b/i;
const INFRA_BACKEND_TITLE = /\b(backend|back[-\s]?end|infrastructure|platform|kubernetes|devops|site reliability|sre|security|inference|database|data platform|storage|network|networking|connectivity|cdn|edge infrastructure|edge networking|content delivery)\b/i;
const PRODUCT_FACING_WORK = /\b(product engineer|product[-\s]?minded|full[-\s]?stack|frontend|front[-\s]?end|web app|user[-\s]?facing|customer[-\s]?facing|product surface|growth|gtm|internal tools|workflow|developer experience|devtools?|sdk|api product)\b/i;
const DOMAIN_HEAVY_SYSTEMS_PATTERNS = [
  /\bdistributed systems?\b/i,
  /\b(kubernetes|k8s|terraform|devops|site reliability|sre|on[-\s]?call|incident response)\b/i,
  /\b(infrastructure|platform engineering|cloud infrastructure|fleet|orchestration|autoscaling)\b/i,
  /\b(cdn|content delivery|edge infrastructure|edge networking|edge caching|traffic routing|global traffic|internet traffic|packet|packets)\b/i,
  /\b(high[-\s]?qps|p9[59]|tail latency|low latency|high performance computing|multi[-\s]?region|load balancing|request routing|traffic management)\b/i,
  /\b(databases?|storage backends?|caching|cdc|consistency|failover|indexing|retrieval)\b/i,
  /\b(inference infrastructure|model serving|accelerators?|gpu|tpu|hardware[-\s]?agnostic)\b/i,
  /\b(microservices?|backend systems?|data[-\s]?intensive)\b/i,
];
const GROUPED_COMPANY_POST = /\b(multiple roles?|engineering roles?|software engineers|senior\s*\+\s*staff engineers?|engineers? \([^)]*,|various roles?)\b/i;
const MIXED_ROLE_SEPARATOR = /[,/]|\band\b/i;
const STAFFING_COMPANY = /\b(robert half|teksystems|kforce|randstad|staffing|recruiting|aquent)\b/i;
const BLACKLISTED_COMPANY = /\b(palantir)\b/i;

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

  if (TARGET_METRO.test(explicit)) return true;
  if (LOCAL_ONLY.test([explicit, description].filter(Boolean).join(" "))) return false;
  if (REMOTE.test(explicit)) return true;
  if (ONSITE_OR_HYBRID.test(explicit)) return false;
  if (LOCAL_ONLY.test(description ?? "")) return false;

  const fallback = description ?? "";
  return TARGET_METRO.test(fallback) || REMOTE.test(fallback);
}

function hasOutsideWorkAuthorizationRestriction(job: JobFitInput): boolean {
  const explicitRegionText = [job.location, job.remoteStatus].filter(Boolean).join(" ");
  const text = haystack(job);
  if (OUTSIDE_US_AUTHORIZATION.test(text)) return true;
  return NON_US_REGION.test(explicitRegionText) && !US_ELIGIBLE_REGION.test(explicitRegionText);
}

function salaryFloor(job: JobFitInput): number {
  const text = haystack(job);
  return DENVER_METRO.test(text) ? 150000 : 170000;
}

function hasWashingtonPreference(job: JobFitInput): boolean {
  return WASHINGTON_PREFERRED.test([job.location, job.remoteStatus].filter(Boolean).join(" "));
}

function systemsDomainBurden(text: string): number {
  return DOMAIN_HEAVY_SYSTEMS_PATTERNS.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function explicitExperienceYears(text: string): number | undefined {
  const values: number[] = [];
  for (const match of text.matchAll(/\b(\d{2})\+?\s*(?:years|yrs)\b/gi)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const before = text.slice(Math.max(0, start - 100), start).toLowerCase();
    const after = text.slice(end, end + 100).toLowerCase();
    const candidateLead =
      /(?:\b(?:you|your|candidate|applicant)s?\b[\s\S]{0,60}\b(?:has|have|bring|possess|with)\b|\b(?:requires?|required|minimum|at least|must|should|needs?|seeking|looking for)\b[\s\S]{0,60})[\s:,-]*$/.test(before);
    const candidateQualification =
      /^\s*(?:of\s+)?(?:(?:relevant|professional|industry|software|engineering|technical|hands-on|product|frontend|backend|full-stack|web)\s+){0,4}experience\b/.test(after) ||
      /^\s*[’']\s*experience\b/.test(after) ||
      /^\s+(?:of|in)\s+(?:(?:relevant|professional|industry|software|product|frontend|backend|full-stack|web)\s+){0,4}(?:engineering|development)\b/.test(after) ||
      /^\s+(?:building|developing|engineering|leading|managing|shipping|designing|working)\b/.test(after);
    const aggregateContext = /\b(?:we|our|team|company|organization|combined|collective|aggregate|founded|established|in business)\b/.test(
      `${before.slice(-60)} ${after.slice(0, 50)}`,
    );
    if ((candidateLead || candidateQualification) && !(aggregateContext && !candidateLead)) {
      values.push(Number(match[1]));
    }
  }
  return values.length > 0 ? Math.max(...values) : undefined;
}

export function classifyJobFit(job: JobFitInput): JobFit {
  const text = haystack(job);
  const lowerCompany = job.company.toLowerCase();
  const reasons: string[] = [];
  const rejectionReasons: string[] = [];
  let score = 0;
  const experienceYears = explicitExperienceYears(text);

  if (BLACKLISTED_COMPANY.test(lowerCompany)) {
    return { isRelevant: false, score: 0, reasons, rejectionReasons: ["blacklisted company"] };
  }

  if (NON_JOB.test(text) || STAFFING_COMPANY.test(lowerCompany)) {
    return { isRelevant: false, score: 0, reasons, rejectionReasons: ["not a direct job post"] };
  }

  if (TARGET_ROLE.test(job.title)) {
    score += 4;
    reasons.push("target role");
  } else if (GENERALIST_ENGINEERING_ROLE.test(job.title) && /\bengineering\b/i.test(text) && TARGET_DOMAIN.test(text)) {
    score += 3;
    reasons.push("generalist engineering role");
  } else if (TARGET_STACK.test(job.title) && /\bengineer|developer|programmer\b/i.test(job.title)) {
    score += 2;
    reasons.push("engineering role with target stack");
  } else if (/\b(software|backend|platform|infrastructure) engineer\b/i.test(job.title) && TARGET_STACK.test(text)) {
    score += 2;
    reasons.push("engineering role with target stack");
  } else {
    rejectionReasons.push("not target role");
  }

  if (NON_TARGET_ROLE.test(job.title) && (!/engineer|developer/i.test(job.title) || /\b(design engineer|intern\b|internship)\b/i.test(job.title))) {
    score -= 4;
    rejectionReasons.push("not target role");
  }

  if (MOBILE_PLATFORM_ROLE.test(job.title)) {
    score -= 6;
    rejectionReasons.push("mobile specialist role");
  }

  if (EMBEDDED_HARDWARE_ROLE.test([job.title, job.description].filter(Boolean).join(" "))) {
    score -= 8;
    rejectionReasons.push("embedded/hardware specialist role");
  }

  const systemsBurden = systemsDomainBurden(text);
  const productFacing = PRODUCT_FACING_WORK.test([job.title, job.description].filter(Boolean).join(" "));
  if ((INFRA_BACKEND_TITLE.test(job.title) && systemsBurden >= 2) || (systemsBurden >= 4 && !productFacing)) {
    score -= 6;
    rejectionReasons.push("backend/infrastructure specialist role");
  } else if (systemsBurden >= 3) {
    score -= 3;
    reasons.push("backend/infrastructure-heavy role");
  }

  if (GROUPED_COMPANY_POST.test(job.title)) {
    score -= 4;
    rejectionReasons.push("grouped company post");
  }

  if (NON_TARGET_ROLE.test(job.title) && TARGET_ROLE.test(job.title) && MIXED_ROLE_SEPARATOR.test(job.title)) {
    score -= 4;
    rejectionReasons.push("grouped mixed-role post");
  }

  if (hasOutsideWorkAuthorizationRestriction(job)) {
    rejectionReasons.push("outside work authorization");
  }

  if (SENIORITY_REACH_TITLE.test(job.title) || (experienceYears !== undefined && experienceYears >= 10)) {
    score -= 1;
    reasons.push("seniority reach");
  }

  if (OUTSIDE_SENIORITY_TITLE.test(job.title) || (experienceYears !== undefined && experienceYears >= 12)) {
    rejectionReasons.push("outside seniority range");
  }

  if (isTargetLocation(job.location, job.remoteStatus, job.description)) {
    score += 3;
    reasons.push("target location");
    if (hasWashingtonPreference(job)) {
      score += 2;
      reasons.push("Seattle/WA preference");
    }
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
    const floor = salaryFloor(job);
    if (salary.max >= 180000) {
      score += 2;
      reasons.push("salary target");
    } else if (salary.max >= floor) {
      reasons.push("salary acceptable");
    } else {
      score -= 3;
      rejectionReasons.push("below salary floor");
    }
  }

  if (EXCEPTIONAL_REACH_TITLE.test(job.title) && !(productFacing && score >= 12)) {
    rejectionReasons.push("seniority reach without exceptional role fit");
  }

  const isRelevant =
    score >= 7 &&
    !rejectionReasons.includes("not target role") &&
    !rejectionReasons.includes("outside target locations") &&
    !rejectionReasons.includes("outside work authorization") &&
    !rejectionReasons.includes("grouped company post") &&
    !rejectionReasons.includes("grouped mixed-role post") &&
    !rejectionReasons.includes("below salary floor") &&
    !rejectionReasons.includes("mobile specialist role") &&
    !rejectionReasons.includes("embedded/hardware specialist role") &&
    !rejectionReasons.includes("backend/infrastructure specialist role") &&
    !rejectionReasons.includes("outside seniority range") &&
    !rejectionReasons.includes("seniority reach without exceptional role fit");
  return { isRelevant, score: Math.max(0, score), reasons: [...new Set(reasons)], rejectionReasons: [...new Set(rejectionReasons)] };
}
