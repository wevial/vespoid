import { matchesJobArea, type AreaFilterJob, type JobAreaFilter } from "./job-area";
import {
  applyPreferenceSignals,
  type PreferenceFeedback,
  type PreferenceScorableJob,
} from "../../convex/jobPreferenceScore";

export const WEEKLY_RECOMMENDATION_AREAS = [
  { area: "remote", label: "Remote" },
  { area: "seattle", label: "Seattle" },
  { area: "sf-bay", label: "SF Bay" },
  { area: "denver-boulder", label: "Denver / Boulder" },
] as const satisfies readonly { area: Exclude<JobAreaFilter, "all">; label: string }[];

export type RecommendationJob = PreferenceScorableJob & AreaFilterJob & {
  isActive: boolean;
  discoveredAt?: string;
};

type RecommendationGroup<Job extends RecommendationJob> = {
  area: Exclude<JobAreaFilter, "all">;
  label: string;
  jobs: ReturnType<typeof applyPreferenceSignals<Job>>;
};

export function selectWeeklyRecommendations<Job extends RecommendationJob>(
  jobs: readonly Job[],
  feedback: readonly PreferenceFeedback<Job>[],
  perArea = 5,
  triagedJobIds: Iterable<string> = feedback.map((item) => item.job._id),
): RecommendationGroup<Job>[] {
  const triagedIds = new Set(triagedJobIds);
  const scoredJobs = applyPreferenceSignals(
    jobs.filter((job) => job.isActive && !triagedIds.has(job._id)),
    feedback,
  );

  return WEEKLY_RECOMMENDATION_AREAS.map(({ area, label }) => ({
    area,
    label,
    jobs: scoredJobs
      .filter((job) => matchesJobArea(job, area))
      .sort((a, b) => b.personalizedScore - a.personalizedScore || (b.discoveredAt ?? "").localeCompare(a.discoveredAt ?? ""))
      .slice(0, perArea),
  }));
}
