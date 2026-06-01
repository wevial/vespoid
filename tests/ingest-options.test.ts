import { describe, expect, test } from "bun:test";
import { parseIngestOptions, shouldMarkStale } from "../src/lib/ingest-options";

describe("ingest options", () => {
  test("marks stale by default for full-source refreshes", () => {
    expect(parseIngestOptions([])).toEqual({ markStale: true });
    expect(shouldMarkStale(parseIngestOptions([]))).toBe(true);
  });

  test("supports no-stale upsert-only ingestion for incremental low-volume runs", () => {
    expect(parseIngestOptions(["--no-stale"])).toEqual({ markStale: false });
    expect(shouldMarkStale(parseIngestOptions(["--no-stale"]))).toBe(false);
  });

  test("rejects unknown ingest options", () => {
    expect(() => parseIngestOptions(["--wat"])).toThrow("Unknown ingest option: --wat");
  });
});
