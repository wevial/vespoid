import { BACKEND_DIRECTION_TITLE, systemsDomainPenalty } from "./jobDomainFit";

type PreferenceStatus = "saved" | "applied" | "archived";

export type PreferenceScorableJob = {
  _id: string;
  title: string;
  company: string;
  source?: string;
  location?: string;
  remoteStatus?: string;
  fitScore?: number;
  fitReasons?: string[];
  description?: string;
};

export type PreferenceFeedback<Job extends PreferenceScorableJob> = {
  status: PreferenceStatus;
  job: Job;
};

export type PreferenceScoredJob<Job extends PreferenceScorableJob> = Job & {
  preferenceScore: number;
  personalizedScore: number;
  preferenceReasons: string[];
};

const POSITIVE_STATUS_WEIGHT: Record<Exclude<PreferenceStatus, "archived">, number> = {
  saved: 1,
  applied: 1.5,
};

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "senior",
  "staff",
  "software",
  "engineer",
  "engineering",
  "systems",
  "team",
]);

function tokens(value: string | undefined) {
  return new Set(
    (value ?? "")
      .toLowerCase()
      .split(/[^a-z0-9+]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !STOP_WORDS.has(token)),
  );
}

function tokenOverlap(a: Set<string>, b: Set<string>) {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count += 1;
  }
  return count;
}

const EMBEDDED_HARDWARE_DOMAIN = /\b(embedded|firmware|kernel|device driver|connectivity|bluetooth|ble\b|wi[-\s]?fi|wireless|consumer devices?|hardware[-\s]?in[-\s]?the[-\s]?loop|flight software|rf software|avionics|power systems controls?|control systems?|hardware accelerators?|accelerator platforms?)\b/i;

function domainMismatchPenalty(job: PreferenceScorableJob) {
  const text = [job.title, job.company, job.location, job.remoteStatus, job.fitReasons?.join(" "), job.description].filter(Boolean).join(" ");
  if (EMBEDDED_HARDWARE_DOMAIN.test(text)) return { penalty: 8, reason: "embedded/hardware specialist domain" };
  const domainPenalty = systemsDomainPenalty(job.title, job.description);
  if (domainPenalty === 6) {
    return { penalty: 6, reason: "backend/infrastructure specialist domain" };
  }
  if (domainPenalty === 3) return { penalty: 3, reason: "backend/infrastructure-heavy domain" };
  if (BACKEND_DIRECTION_TITLE.test(job.title)) {
    return { penalty: 2, reason: "backend title: career-direction preference (not capability)" };
  }
  return { penalty: 0, reason: undefined };
}

function similarityScore(a: PreferenceScorableJob, b: PreferenceScorableJob) {
  let score = tokenOverlap(tokens(a.title), tokens(b.title)) * 1.4;
  score += tokenOverlap(tokens(a.fitReasons?.join(" ")), tokens(b.fitReasons?.join(" "))) * 0.8;

  if (a.source && b.source && a.source === b.source) score += 0.4;
  if (a.remoteStatus && b.remoteStatus && a.remoteStatus === b.remoteStatus) score += 0.5;
  if (a.location && b.location && tokenOverlap(tokens(a.location), tokens(b.location)) > 0) score += 0.6;
  if (a.company && b.company && a.company === b.company) score += 0.3;

  return score;
}

export function applyPreferenceSignals<Job extends PreferenceScorableJob>(
  jobs: readonly Job[],
  feedback: readonly PreferenceFeedback<Job>[],
): PreferenceScoredJob<Job>[] {
  return jobs
    .map((job) => {
      let positiveScore = 0;
      let archivedScore = 0;

      for (const item of feedback) {
        if (item.job._id === job._id) continue;
        const similarity = similarityScore(job, item.job);
        if (similarity <= 0) continue;

        if (item.status === "archived") {
          archivedScore = Math.max(archivedScore, similarity);
        } else {
          positiveScore = Math.max(positiveScore, similarity * POSITIVE_STATUS_WEIGHT[item.status]);
        }
      }

      const domainMismatch = domainMismatchPenalty(job);
      const feedbackPreferenceScore = Math.min(Math.max(positiveScore - archivedScore, -6), 6);
      const rawPreferenceScore = feedbackPreferenceScore - domainMismatch.penalty;
      const preferenceScore = Math.round(Math.min(Math.max(rawPreferenceScore, -10), 6) * 10) / 10;
      const preferenceReasons: string[] = [];
      if (positiveScore >= 2 && preferenceScore > 0) preferenceReasons.push("similar to saved/applied roles");
      if (archivedScore >= 2 && preferenceScore < 0) preferenceReasons.push("similar to archived roles");
      if (domainMismatch.reason) preferenceReasons.push(domainMismatch.reason);

      return {
        ...job,
        preferenceScore,
        personalizedScore: Math.round(((job.fitScore ?? 0) + preferenceScore) * 10) / 10,
        preferenceReasons,
      };
    })
    .sort((a, b) => b.personalizedScore - a.personalizedScore);
}
