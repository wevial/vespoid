export interface IngestOptions {
  markStale: boolean;
}

export interface RefreshMetadata {
  complete?: unknown;
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
  activeJobs: Array<{ _id: Id; source: string; url: string }>,
  currentUrlsBySource: Map<string, Set<string>>,
  options: IngestOptions,
  refresh: RefreshMetadata = {},
): Id[] {
  if (!shouldMarkStale(options, refresh)) return [];
  return activeJobs
    .filter((job) => {
      const sourceUrls = currentUrlsBySource.get(job.source);
      return sourceUrls !== undefined && !sourceUrls.has(job.url);
    })
    .map((job) => job._id);
}
