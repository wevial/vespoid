export interface IngestOptions {
  markStale: boolean;
}

export function parseIngestOptions(argv: string[]): IngestOptions {
  const options: IngestOptions = { markStale: true };
  for (const arg of argv) {
    if (arg === "--no-stale") options.markStale = false;
    else throw new Error(`Unknown ingest option: ${arg}`);
  }
  return options;
}

export function shouldMarkStale(options: IngestOptions): boolean {
  return options.markStale;
}
