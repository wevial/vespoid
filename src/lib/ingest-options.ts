export interface IngestOptions {
  markStale: boolean;
}

export interface RefreshMetadata {
  complete?: unknown;
  successfulScopes?: string[];
  failedScopes?: string[];
}

export function parseIngestOptions(argv: string[]): IngestOptions {
  const options: IngestOptions = { markStale: true };
  for (const arg of argv) {
    if (arg === "--no-stale") options.markStale = false;
    else throw new Error(`Unknown ingest option: ${arg}`);
  }
  return options;
}

export function shouldMarkStale(options: IngestOptions, refresh: RefreshMetadata = {}): boolean {
  return options.markStale && refresh.complete !== false;
}

export function selectStaleIds<Id>(
  activeJobs: Array<{ _id: Id; source: string; url: string; refreshScope?: string }>,
  currentUrlsBySource: Map<string, Set<string>>,
  options: IngestOptions,
  refresh: RefreshMetadata = {},
  currentUrlsByScope: Map<string, Set<string>> = new Map(),
): Id[] {
  const scopedPartialRefresh = options.markStale && refresh.complete === false && refresh.successfulScopes !== undefined;
  if (!shouldMarkStale(options, refresh) && !scopedPartialRefresh) return [];
  return activeJobs
    .filter((job) => {
      if (job.source === "company_board" && refresh.complete === false && refresh.successfulScopes !== undefined) {
        if (!job.refreshScope || !refresh.successfulScopes.includes(job.refreshScope)) return false;
        return !currentUrlsByScope.get(job.refreshScope)?.has(job.url);
      }
      const sourceUrls = currentUrlsBySource.get(job.source);
      return sourceUrls !== undefined && !sourceUrls.has(job.url);
    })
    .map((job) => job._id);
}
