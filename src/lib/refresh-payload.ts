export interface RefreshPayload<Job> {
  source: string;
  jobs: Job[];
  complete: boolean;
  failedSources: string[];
  successfulScopes?: string[];
  failedScopes?: string[];
}

export function refreshPayload<Job>(
  source: string,
  jobs: Job[],
  failedSources: string[] = [],
  scopes?: { successful: string[]; failed: string[] },
): RefreshPayload<Job> {
  return {
    source,
    jobs,
    complete: failedSources.length === 0,
    failedSources,
    ...(scopes
      ? {
          successfulScopes: [...new Set(scopes.successful)].sort(),
          failedScopes: [...new Set(scopes.failed)].sort(),
        }
      : {}),
  };
}
