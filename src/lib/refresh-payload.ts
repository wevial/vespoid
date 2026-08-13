export interface RefreshPayload<Job> {
  source: string;
  jobs: Job[];
  complete: boolean;
  failedSources: string[];
}

export function refreshPayload<Job>(source: string, jobs: Job[], failedSources: string[] = []): RefreshPayload<Job> {
  return {
    source,
    jobs,
    complete: failedSources.length === 0,
    failedSources,
  };
}