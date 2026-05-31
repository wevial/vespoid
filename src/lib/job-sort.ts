import { extractSalaryRange } from "./job-fit";

export type JobSortOption = "fit" | "date-desc" | "salary-desc";

export interface SortableJob {
  discoveredAt?: string;
  postedAt?: string;
  salaryRange?: string;
  fitScore?: number;
}

function timestamp(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function salaryMax(value?: string): number {
  return extractSalaryRange(value)?.max ?? 0;
}

export function sortJobs<T extends SortableJob>(jobs: readonly T[], sort: JobSortOption): T[] {
  return [...jobs].sort((a, b) => {
    if (sort === "date-desc") {
      return timestamp(b.discoveredAt) - timestamp(a.discoveredAt);
    }

    if (sort === "salary-desc") {
      return salaryMax(b.salaryRange) - salaryMax(a.salaryRange) || (b.fitScore ?? 0) - (a.fitScore ?? 0);
    }

    return (b.fitScore ?? 0) - (a.fitScore ?? 0) || timestamp(b.postedAt ?? b.discoveredAt) - timestamp(a.postedAt ?? a.discoveredAt);
  });
}
