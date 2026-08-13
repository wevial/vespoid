import { afterEach, describe, expect, test } from "bun:test";
import { scrapeCityBoards } from "../scripts/scrape-city-boards";
import { scrapeCompanyBoards } from "../scripts/scrape-company-boards";
import { parseIngestOptions, selectStaleIds, shouldMarkStale } from "../src/lib/ingest-options";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(respond: (url: string) => Response): void {
  globalThis.fetch = (async (input: string | URL | Request) => respond(String(input))) as typeof fetch;
}

function successfulResponse(): Response {
  return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
}

describe("refresh completeness", () => {
  test("marks a company-board payload incomplete when the GitHub careers API fails", async () => {
    mockFetch((url) => url.includes("github.careers/api/jobs")
      ? new Response("unavailable", { status: 503, statusText: "Service Unavailable" })
      : successfulResponse());

    const payload = await scrapeCompanyBoards([{ provider: "ashby", slug: "example" }]);

    expect(payload).toMatchObject({
      source: "company_board",
      complete: false,
      failedSources: ["github-careers"],
    });
    expect(payload.jobs).toEqual([]);
  });

  test("marks a city-board payload incomplete when one Built In page fails", async () => {
    mockFetch((url) => url.endsWith("/failed")
      ? new Response("unavailable", { status: 503, statusText: "Service Unavailable" })
      : new Response("<html></html>", { status: 200 }));

    const payload = await scrapeCityBoards([
      { city: "seattle", label: "Built In Seattle", paths: ["/working", "/failed"] },
    ]);

    expect(payload).toMatchObject({
      source: "city_board",
      complete: false,
      failedSources: ["builtin:seattle:1"],
    });
    expect(payload.jobs).toEqual([]);
  });

  test("marks a company-board payload incomplete when a configured Workable detail page fails", async () => {
    mockFetch((url) => {
      if (url.endsWith("/jobs.md")) {
        return new Response("| Senior Engineer | Engineering | Remote | Full-time | — | 2026-08-01 | [View](https://apply.workable.com/example/jobs/view/1.md) |", { status: 200 });
      }
      if (url.endsWith("/1.md")) return new Response("unavailable", { status: 503, statusText: "Service Unavailable" });
      return successfulResponse();
    });

    const payload = await scrapeCompanyBoards([{ provider: "workable", slug: "example" }]);

    expect(payload).toMatchObject({
      source: "company_board",
      complete: false,
      failedSources: ["workable:example"],
    });
  });

  test("marks a company-board payload incomplete when a discovered Nous role page falls back", async () => {
    mockFetch((url) => {
      if (url === "https://nousresearch.com/careers") {
        return new Response(`
          <p>Our team is fully remote.</p>
          <a class="role-link" href="/full-stack-engineer/">Full Stack Engineer</a>
        `, { status: 200 });
      }
      if (url === "https://nousresearch.com/full-stack-engineer/") {
        return new Response("unavailable", { status: 503, statusText: "Service Unavailable" });
      }
      return successfulResponse();
    });

    const payload = await scrapeCompanyBoards([{ provider: "ashby", slug: "example" }]);

    expect(payload).toMatchObject({
      source: "company_board",
      complete: false,
      failedSources: ["nousresearch-careers:0"],
    });
    expect(payload.jobs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        company: "Nous Research",
        url: "https://nousresearch.com/full-stack-engineer/",
      }),
    ]));
  });

  test("marks a city-board payload complete when every Built In page succeeds", async () => {
    mockFetch(() => new Response("<html></html>", { status: 200 }));

    const payload = await scrapeCityBoards([
      { city: "seattle", label: "Built In Seattle", paths: ["/working"] },
    ]);

    expect(payload).toEqual({ source: "city_board", jobs: [], complete: true, failedSources: [] });
  });

  test("marks stale for complete refreshes but never for incomplete refreshes", () => {
    const options = parseIngestOptions([]);

    expect(shouldMarkStale(options, { complete: true })).toBe(true);
    expect(shouldMarkStale(options, { complete: false })).toBe(false);
    expect(shouldMarkStale(parseIngestOptions(["--no-stale"]), { complete: true })).toBe(false);
    expect(shouldMarkStale(options, {})).toBe(true);
  });

  test("selects no stale jobs from an incomplete refresh while retaining complete-refresh reconciliation", () => {
    const active = [
      { _id: "present", source: "company_board", url: "https://example.com/present" },
      { _id: "missing", source: "company_board", url: "https://example.com/missing" },
      { _id: "hn", source: "hn", url: "https://news.ycombinator.com/item?id=1" },
    ];
    const currentUrlsBySource = new Map([["company_board", new Set(["https://example.com/present"])]]) as Map<string, Set<string>>;

    expect(selectStaleIds(active, currentUrlsBySource, parseIngestOptions([]), { complete: false })).toEqual([]);
    expect(selectStaleIds(active, currentUrlsBySource, parseIngestOptions([]), { complete: true })).toEqual(["missing"]);
  });
});
