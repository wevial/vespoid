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

function builtinPage(jobs: unknown[] = []): Response {
  return new Response(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { jobs } } })}</script>`, { status: 200 });
}

function builtinTargetJob(id: number, title = "Senior Full Stack Engineer") {
  return {
    title,
    company: "ExampleCo",
    location: "Seattle, WA",
    url: `/job/${title.toLowerCase().replaceAll(" ", "-")}/${id}`,
    description: "Build React and TypeScript products.",
  };
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
      successfulScopes: ["ashby:example", "greptile-careers", "nousresearch-careers", "posthog-careers"],
      failedScopes: ["github-careers"],
    });
    expect(payload.jobs).toEqual([]);
  });

  test("reports an empty successful company board as a successful scope", async () => {
    mockFetch(() => successfulResponse());

    const payload = await scrapeCompanyBoards([{ provider: "ashby", slug: "empty-board" }]);

    expect(payload).toMatchObject({
      source: "company_board",
      complete: true,
      failedSources: [],
      successfulScopes: ["ashby:empty-board", "github-careers", "greptile-careers", "nousresearch-careers", "posthog-careers"],
      failedScopes: [],
      jobs: [],
    });
  });
  test("requests Built In pages 1 through 5 in route order without exceeding the cap", async () => {
    const requested: string[] = [];
    mockFetch((url) => {
      requested.push(url);
      return builtinPage();
    });

    const payload = await scrapeCityBoards([
      { city: "seattle", label: "Built In Seattle", paths: ["/jobs/seattle/dev-engineering"] },
      { city: "remote", label: "Built In Remote", paths: ["/jobs/remote/dev-engineering"] },
    ], { requestDelayMs: 0 });

    expect(requested).toEqual([
      "https://builtin.com/jobs/seattle/dev-engineering",
      "https://builtin.com/jobs/seattle/dev-engineering?page=2",
      "https://builtin.com/jobs/seattle/dev-engineering?page=3",
      "https://builtin.com/jobs/seattle/dev-engineering?page=4",
      "https://builtin.com/jobs/seattle/dev-engineering?page=5",
      "https://builtin.com/jobs/remote/dev-engineering",
      "https://builtin.com/jobs/remote/dev-engineering?page=2",
      "https://builtin.com/jobs/remote/dev-engineering?page=3",
      "https://builtin.com/jobs/remote/dev-engineering?page=4",
      "https://builtin.com/jobs/remote/dev-engineering?page=5",
    ]);
    expect(payload).toMatchObject({ complete: true, failedSources: [] });
  });

  test("deduplicates Built In jobs globally by numeric identity with the first record winning", async () => {
    mockFetch((url) => {
      if (url === "https://builtin.com/jobs/seattle/dev-engineering") return builtinPage([builtinTargetJob(123, "First Full Stack Engineer")]);
      if (url === "https://builtin.com/jobs/remote/dev-engineering") return builtinPage([builtinTargetJob(123, "Later Full Stack Engineer")]);
      return builtinPage();
    });

    const payload = await scrapeCityBoards([
      { city: "seattle", label: "Built In Seattle", paths: ["/jobs/seattle/dev-engineering"] },
      { city: "remote", label: "Built In Remote", paths: ["/jobs/remote/dev-engineering"] },
    ], { requestDelayMs: 0 });

    expect(payload.jobs).toHaveLength(1);
    expect(payload.jobs[0]).toMatchObject({ title: "First Full Stack Engineer", url: "https://builtin.com/job/first-full-stack-engineer/123" });
  });

  test("deduplicates Built In jobs globally by normalized canonical URL without a numeric identity", async () => {
    mockFetch((url) => {
      if (url === "https://builtin.com/jobs/seattle/dev-engineering") {
        return builtinPage([{ ...builtinTargetJob(123), url: "/job/no-numeric-id?utm_source=seattle" }]);
      }
      if (url === "https://builtin.com/jobs/remote/dev-engineering") {
        return builtinPage([{ ...builtinTargetJob(456, "Later Engineer"), url: "https://builtin.com/job/no-numeric-id#remote" }]);
      }
      return builtinPage();
    });

    const payload = await scrapeCityBoards([
      { city: "seattle", label: "Built In Seattle", paths: ["/jobs/seattle/dev-engineering"] },
      { city: "remote", label: "Built In Remote", paths: ["/jobs/remote/dev-engineering"] },
    ], { requestDelayMs: 0 });

    expect(payload.jobs).toHaveLength(1);
    expect(payload.jobs[0]).toMatchObject({ title: "Senior Full Stack Engineer", url: "https://builtin.com/job/no-numeric-id?utm_source=seattle" });
  });

  test("continues after a valid page has no relevant jobs", async () => {
    const requested: string[] = [];
    mockFetch((url) => {
      requested.push(url);
      return url.endsWith("?page=2")
        ? builtinPage([builtinTargetJob(456)])
        : builtinPage([builtinTargetJob(999, "Customer Success Manager")]);
    });

    const payload = await scrapeCityBoards([
      { city: "seattle", label: "Built In Seattle", paths: ["/jobs/seattle/dev-engineering"] },
    ], { requestDelayMs: 0 });

    expect(requested).toHaveLength(5);
    expect(payload).toMatchObject({ complete: true, failedSources: [] });
    expect(payload.jobs).toEqual([expect.objectContaining({ url: "https://builtin.com/job/senior-full-stack-engineer/456" })]);
  });

  for (const [name, failure] of [
    ["403 response", () => new Response("forbidden", { status: 403, statusText: "Forbidden" })],
    ["429 response", () => new Response("rate limited", { status: 429, statusText: "Too Many Requests" })],
    ["challenge HTML", () => new Response("<html><title>Just a moment...</title></html>", { status: 200 })],
    ["invalid page shape", () => new Response("<html><body>not a Built In jobs page</body></html>", { status: 200 })],
    ["parseable Next payload without a listing", () => new Response("<script id=\"__NEXT_DATA__\">{}</script>", { status: 200 })],
    ["parseable Next payload with a missing jobs array", () => new Response("<script id=\"__NEXT_DATA__\">{\"props\":{\"pageProps\":{}}}</script>", { status: 200 })],
    ["parser exception", () => new Response("<script id=\"__NEXT_DATA__\">not json</script>", { status: 200 })],
  ] as const) {
    test(`marks the city-board payload incomplete on a Built In ${name}`, async () => {
      const requested: string[] = [];
      mockFetch((url) => {
        requested.push(url);
        return url.endsWith("?page=2") ? failure() : builtinPage([builtinTargetJob(123)]);
      });

      const payload = await scrapeCityBoards([
        { city: "seattle", label: "Built In Seattle", paths: ["/jobs/seattle/dev-engineering"] },
      ], { requestDelayMs: 0 });

      expect(requested).toEqual([
        "https://builtin.com/jobs/seattle/dev-engineering",
        "https://builtin.com/jobs/seattle/dev-engineering?page=2",
      ]);
      expect(payload).toMatchObject({
        source: "city_board",
        complete: false,
        failedSources: ["builtin:seattle:/jobs/seattle/dev-engineering:page:2"],
        jobs: [expect.objectContaining({ url: "https://builtin.com/job/senior-full-stack-engineer/123" })],
      });
    });
  }

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
        refreshScope: "nousresearch-careers",
      }),
    ]));
  });

  test("marks a city-board payload complete when every Built In page succeeds", async () => {
    mockFetch(() => builtinPage());

    const payload = await scrapeCityBoards([
      { city: "seattle", label: "Built In Seattle", paths: ["/working"] },
    ], { requestDelayMs: 0 });

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

  test("reconciles successful company scopes while retaining omissions from failed scopes", () => {
    const active = [
      { _id: "good-present", source: "company_board", refreshScope: "ashby:good", url: "https://example.com/good-present" },
      { _id: "good-missing", source: "company_board", refreshScope: "ashby:good", url: "https://example.com/good-missing" },
      { _id: "bad-present", source: "company_board", refreshScope: "ashby:bad", url: "https://example.com/bad-present" },
      { _id: "bad-missing", source: "company_board", refreshScope: "ashby:bad", url: "https://example.com/bad-missing" },
      { _id: "legacy-missing", source: "company_board", url: "https://example.com/legacy-missing" },
    ];
    const currentUrlsBySource = new Map([["company_board", new Set(["https://example.com/good-present", "https://example.com/bad-present"])]]) as Map<string, Set<string>>;
    const currentUrlsByScope = new Map([["ashby:good", new Set(["https://example.com/good-present"])]]) as Map<string, Set<string>>;
    const refresh = { complete: false, successfulScopes: ["ashby:good"], failedScopes: ["ashby:bad"] };

    const staleIds = selectStaleIds(active, currentUrlsBySource, parseIngestOptions([]), refresh, currentUrlsByScope);

    expect(staleIds).toEqual(["good-missing"]);
  });

  test("reconciles an empty successful company scope while retaining failed and legacy scopes", () => {
    const active = [
      { _id: "empty-missing", source: "company_board", refreshScope: "ashby:empty", url: "https://example.com/empty-missing" },
      { _id: "failed-missing", source: "company_board", refreshScope: "ashby:failed", url: "https://example.com/failed-missing" },
      { _id: "legacy-missing", source: "company_board", url: "https://example.com/legacy-missing" },
    ];
    const currentUrlsBySource = new Map<string, Set<string>>();
    const currentUrlsByScope = new Map<string, Set<string>>();
    const refresh = { complete: false, successfulScopes: ["ashby:empty"], failedScopes: ["ashby:failed"] };

    const staleIds = selectStaleIds(active, currentUrlsBySource, parseIngestOptions([]), refresh, currentUrlsByScope);

    expect(staleIds).toEqual(["empty-missing"]);
  });
});
