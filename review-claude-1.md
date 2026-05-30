# Vespoid PLAN.md — Implementation Review (Round 3)

Reviewer: Claude Sonnet 4.6  
Date: 2026-05-30  
Plan lines reviewed: 1–1279

---

## 1. Architecture

### 1a. `listActiveJobs` is unbounded — stale checker time-bomb

**Lines 425–433, 1084**

`listActiveJobs` does `.collect()` with no `.take()` limit. The stale checker calls this once and gets every active job in memory. After months of nightly scrapes this could be thousands of documents and hit Convex's per-query document read limit (currently 8,192 documents, returning a runtime error that kills the entire stale run).

Fix: add `.take(2000)` or implement cursor pagination inside `checkStale`. Alternatively, `checkStale` can loop over jobs in batches using Convex's cursor API rather than fetching the entire table at once.

### 1b. Race condition in `upsertJob` is understated

**Lines 1254–1256**

The plan says "Mitigation: scrapers run sequentially (not concurrently)". But Step 11 sets up two separate Hermes cron jobs (`vespoid-scrape-hn` and `vespoid-scrape-wellfound`) with identical schedules (`0 14 */2 * *`). Two cron jobs scheduled at the same time *will* run concurrently. The mitigation claimed in the design decisions section does not hold.

Fix: either stagger the cron schedules (e.g., offset by 30 minutes), combine both scrapers into a single cron job, or add a Convex scheduled function that runs them sequentially server-side.

### 1c. `listJobs` returns job objects with no application data

**Lines 341–409**

When `args.status` is set, `listJobs` filters jobs to those with a matching application, but the returned array is still plain `Job` objects — no `status`, `appliedAt`, or `notes` from `applications`. The job list page wants to render status per row, so the caller must issue N additional `getJobWithApplication` queries (one per visible row), producing an N+1 query pattern.

Fix: return `{ job, application }` pairs from `listJobs` (similar to `getJobWithApplication`), or add an `applications` join inside the handler and return a merged object.

### 1d. `statusCounts.total` is wrong and `unread` is misleading

**Lines 435–458**

- `total: apps.length` counts application records, not jobs. A job that transitions from "saved" → "applied" creates one record and the count is still 1, but a fresh install with zero jobs and zero applications would show `total: 0` correctly. The meaning is ambiguous — rename to `totalApplications`.
- `unread: Math.max(0, activeJobs.length - appliedJobIds.size)` uses `appliedJobIds` which is a `Set` built from ALL application `jobId`s (line 444), including applications for jobs that are now `isActive: false`. An archived job's application record still counts against `appliedJobIds.size`, so `unread` can be understated. Build the set from application records whose `jobId` matches active jobs only.

### 1e. `search` filter is silently dropped when `status` is also set

**Lines 386–408**

The handler has two separate `if` blocks: `if (args.status)` returns early (line 393), so if the caller passes both `status` and `search`, the `search` block is never reached and no search filtering happens. No error is raised.

Fix: combine both filters in a single return path, or validate that the two args are mutually exclusive and throw a `ConvexError`.

### 1f. Two conflicting ingestion architectures

**Lines 966–1031**

Step 9 defines `ingest.ts` as the canonical pipeline approach, but lines 1020–1031 then present an alternative "Better approach" where scrapers call Convex mutations directly. The cron at Step 11 uses the pipe approach. This leaves the reader without a clear canonical choice, and the "better approach" code uses `process.env.CONVEX_URL!` with a non-null assertion — the exact anti-pattern fixed elsewhere (item 5 in the changelog). Commit to one architecture.

---

## 2. Schema / Code

### 2a. `next.config.ts` uses a nonexistent API

**Lines 98–101**

```ts
import { defineConfig } from "next/config";
export default defineConfig({});
```

`defineConfig` does not exist in `next/config`. This is not a Next.js export — it will throw `TypeError: defineConfig is not a function` at startup. The correct pattern for Next.js 14+ with TypeScript is:

```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = {};
export default nextConfig;
```

This is a hard build-breaker.

### 2b. `source` field accepts arbitrary strings throughout

**Lines 119, 181, 344**

Schema has `source: v.string()`. `listJobs` accepts `source: v.optional(v.string())`. A typo like `"hn "` (trailing space) or `"HN"` would silently store and then never match any index query. The index `by_source` would silently return no results.

Fix: use `v.union(v.literal("hn"), v.literal("wellfound"))` in both the schema and all mutation/query args.

### 2c. `check-stale.ts` — `staleIds` has wrong TypeScript type

**Line 1087**

```ts
const staleIds: string[] = [];
```

`job._id` is `Id<"jobs">`, not `string`. Passing `staleIds` to `markStaleBatch` which expects `v.array(v.id("jobs"))` will produce a TypeScript error. Should be `const staleIds: Id<"jobs">[] = [];`.

### 2d. `check-stale.ts` — creates browser pages for HN jobs unnecessarily

**Lines 1094–1104**

Inside each batch's `map`, a new browser page is opened for every job before calling `checkUrlStale`. But `checkUrlStale` immediately returns via `checkHnStale` (plain fetch, no page used) for HN source jobs. The page is still created and closed, wasting browser resources.

Fix: check `job.source === "hn"` before opening a page:

```ts
batch.map(async (job) => {
  if (job.source === "hn") {
    if (await checkHnStale(job.url)) staleIds.push(job._id);
    return;
  }
  const page = await browser.newPage();
  try {
    if (await checkUrlStale(job.url, job.source, page)) staleIds.push(job._id);
  } finally {
    await page.close().catch(() => {});
  }
})
```

### 2e. `checkHnStale` misses deleted/killed HN comments

**Lines 1060–1064**

```ts
return /position filled|no longer accepting|this job has been filled/i.test(body);
```

HN comment pages for posts that are `[dead]` or `[flagged]` return HTTP 200 with the word `[dead]` in the body, not any of the stale patterns. Jobs from deleted accounts show `[deleted]`. These posts would never be marked stale.

Fix: also check `response.status` and body patterns:

```ts
const res = await fetch(url);
if (!res.ok) return true;
const body = await res.text();
return /position filled|no longer accepting|this job has been filled|\[dead\]|\[deleted\]/i.test(body);
```

### 2f. `import path from "path"` appears mid-file after the code that uses it

**Lines 739, 934**

```ts
// ... all the function definitions ...
import path from "path";
if (import.meta.url.endsWith(path.resolve(process.argv[1]))) {
```

ES module imports are hoisted so this is *technically* valid, but it is highly unconventional and will confuse anyone reading or linting the file. It also puts the import after the `export { ... }` statement on line 749, which many linters will flag. Move all imports to the top.

### 2g. `import.meta.url.endsWith(path.resolve(...))` is still fragile

**Lines 740, 936**

The plan changelog (item 8) claims this was fixed to use `path.resolve()`. But `.endsWith()` against an absolute path string is fragile when the script is compiled, bundled, or run with a symlinked path. For Bun, the idiomatic check is:

```ts
if (Bun.main === import.meta.path) {
```

This is Bun-native, handles symlinks, and doesn't depend on string matching.

### 2f. `followUpAt` schema field has no mutation or UI

**Line 149**

The `applications` table defines `followUpAt: v.optional(v.string())` but:
- `setStatus` never writes or reads it
- `updateNotes` never writes or reads it
- No query exposes it
- No UI section mentions it

The field is dead. Either implement follow-up reminders (there's a mention in Next Steps at line 1277) or remove the field from the schema now.

### 2g. `setStatus` missing `followUpAt` arg

Follows from above — if the field is kept, `setStatus` needs an argument to set it, otherwise the calendar reminder feature described in Next Steps is impossible to implement without a schema migration.

### 2h. `applications.by_status` index queries ALL applications of a status

**Lines 387–392**

When filtering by status, the query does:
```ts
const apps = await ctx.db.query("applications").withIndex("by_status", ...).collect();
```

`.collect()` here has no limit and will read every application with that status. With 500+ jobs in "saved" status this becomes a full table scan. Fine for MVP, but should carry a comment acknowledging the limit.

---

## 3. Security

### 3a. No access control on any Convex function

**Lines 181–242, 257–325, 341–458**

All mutations and queries have no `auth.getUserIdentity()` check. The plan acknowledges this ("treat Convex URL as shared secret") but a VPS-hosted tool whose cron prompts log the full Convex URL (see 3b below) is not a closed secret. Anyone with the URL can call `upsertJob`, `markStaleBatch`, or any query. For a job-search tracker, the blast radius is data corruption and privacy leakage of your job applications.

Minimum fix: enable Convex's built-in auth with a static pre-shared token verified in a `mutation` wrapper, or configure Convex's HTTP auth header pattern.

### 3b. Convex URL in plaintext cron prompts

**Lines 1171, 1183**

```
CONVEX_URL=https://<deployment>.convex.cloud bun run scripts/scrape-hn.ts
```

These prompts are stored in Hermes session logs. The Convex URL is the only "authentication" for the entire database. It should be stored in an environment variable on the VPS and referenced by name, not embedded in the prompt string. Use:

```
CONVEX_URL=$CONVEX_URL bun run scripts/scrape-hn.ts
```

and document that `CONVEX_URL` must be set in the VPS environment (e.g., `/etc/environment` or the Hermes cron runner's env).

### 3c. `--disable-web-security` in Wellfound scraper

**Line 851**

`--disable-web-security` disables CORS for the entire browser context. While this is a scraper and not a user-facing browser, it means any malicious script injected by a scraped page can make arbitrary cross-origin requests from the VPS. On a production VPS (per CLAUDE.md: "live server"), this creates a broader attack surface if Wellfound or any redirected URL serves hostile content.

Fix: remove `--disable-web-security` and `--disable-features=IsolateOrigins,site-per-process`. These are not needed for scraping and create unnecessary exposure.

### 3d. Wellfound stealth `permissions.query` returns incomplete `PermissionStatus`

**Lines 840–842**

```js
navigator.permissions.query = () => Promise.resolve({ state: 'granted', onchange: null });
```

`PermissionStatus` objects must implement `EventTarget` (with `addEventListener`/`removeEventListener`/`dispatchEvent`). Bot-detection scripts that call `permissions.query(...).then(p => p.addEventListener('change', ...))` will throw a runtime error, causing fingerprint detection to identify the page as automated. The override should return a proper `EventTarget`-based object or extend `EventTarget`.

### 3e. `@types/jsdom` missing

**Line 68**

`bun add jsdom` is in Step 1 but `@types/jsdom` is not. The `JSDOM` constructor usage in `scrape-hn.ts` line 632 will have implicit `any` types without it, defeating the purpose of TypeScript in the scraper.

Fix: add `bun add -d @types/jsdom` to the install step.

---

## 4. Missing Pieces

### 4a. `convex/auth.config.ts` — no content shown

**Line 77**

Referenced as "empty (no auth for single-user)" but no file content is provided. Convex requires this file to exist with a valid export. Without it, `bunx convex dev` may fail or behave unexpectedly depending on the Convex version.

Minimum valid file:
```ts
export default {
  providers: [],
};
```

### 4b. No `scripts/` directory creation step

The plan writes `scripts/scrape-hn.ts`, `scripts/scrape-wellfound.ts`, `scripts/ingest.ts`, `scripts/check-stale.ts` but never runs `mkdir -p scripts`. `bun create next-app` does not create a `scripts/` directory. Step 8 will fail silently when writing the file if the directory doesn't exist.

### 4c. `@types/jsdom` absent from install commands

**Line 68**

Same as 3e — the install step needs `bun add -d @types/jsdom`.

### 4d. `package.json` `scripts` block never shown

The cron prompt at line 1159 runs `bun run scripts/scrape-hn.ts` but the plan never defines a `"scrape-hn"` key in `package.json`. `bun run scripts/scrape-hn.ts` (with the full path) works without a `scripts` entry, but the plan should clarify this, since readers familiar with `bun run <name>` may be confused when there's no named script.

### 4e. Frontend page implementations are skeleton-only

**Lines 528–605**

Steps 6 provides only comments and skeleton structure ("render counts summary + recent jobs list"). The entire frontend is essentially unspecified: no JSX, no actual component code, no filtering UI, no table markup, no status dropdown. For a plan this detailed on the backend side, the frontend gap is significant. At minimum, the job list page and job detail page need concrete implementations.

### 4f. No error boundaries or error UI states

**Line 551**

The plan notes "`useQuery` returns `undefined` on error" but provides no error UI. In a Convex app, a failed subscription shows `undefined` indefinitely. Without an error boundary or explicit error check, the user sees a loading spinner forever.

### 4g. `tsconfig.json` content not shown

The plan says "Ensure `compilerOptions.types` includes `['bun-types']`" but doesn't show the actual `tsconfig.json`. `bun create next-app` generates a tsconfig that may conflict with `bun-types` (Next.js uses `lib: ["dom"]` which overlaps with Bun's type definitions). A concrete `tsconfig.json` diff is needed.

### 4h. Wellfound pagination not handled

**Lines 894–928**

The Wellfound scraper scrapes only the initial page load. Wellfound uses infinite scroll — the first render typically shows 20–30 listings. No scrolling or pagination is implemented. The scraper as written would capture at most one "page" of results.

Fix: add a scroll loop (e.g., `page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))` in a loop) or use the network tab to intercept the GraphQL/REST API that Wellfound's frontend calls for job data.

### 4i. No `remoteStatus` normalization

**Lines 124, 693–697, 921–924**

HN scraper stores raw segments like `"remote ok"`, `"onsite/hybrid"`, `"in-office"`. Wellfound stores whatever text the DOM contains. The schema says `remoteStatus` is a free `v.string()`. The frontend filtering would need to handle all variations. Define and enforce a canonical set: `"remote" | "hybrid" | "onsite" | undefined`.

### 4j. No shared `JobListing` type across scrapers

Both `scrape-hn.ts` and `scrape-wellfound.ts` define their own `JobListing` interface independently (lines 617–627, 793–802). They're nearly identical but will drift over time. Extract to `scripts/types.ts`.

---

## 5. Scrapers

### 5a. HN Algolia `/items/` may not return all children

**Lines 712–715**

The Algolia `/api/v1/items/{id}` endpoint returns nested children but there's no documented guarantee about maximum depth or count. Popular "Who's Hiring?" threads have 500–1000+ top-level comments. The plan assumes `data.children ?? []` is the complete list, but the Algolia API may paginate or truncate children on heavily-commented threads.

Fix: verify empirically with a real thread, or use the search endpoint with pagination:
```
/api/v1/search?tags=comment,story_<threadId>&hitsPerPage=1000&page=0
```

### 5b. HN thread search title doesn't match actual HN format

**Lines 643–647**

Search title: `"May 2026 Who is hiring?"` — but actual HN thread titles are formatted as `"Ask HN: Who is hiring? (May 2026)"`. The Algolia search for the constructed title may fail or return unrelated results.

Fix: search for `"Ask HN: Who is hiring?"` without the month and filter by `created_at_i` within the current month range, or search for `"who is hiring"` as a looser query and filter by month on the returned results.

### 5c. `findHiringThread` returns first Algolia hit without validating it's a thread

**Lines 648–651**

```ts
if (searchData.hits?.[0]?.objectID) {
  return searchData.hits[0].objectID;
}
```

The first Algolia hit for the search query might be a comment inside a past hiring thread, not the thread itself. There's no check that `hits[0].tags` contains `"story"` or that `hits[0].author === "whoishiring"`.

Fix:
```ts
const thread = searchData.hits?.find((h: any) =>
  h.author === "whoishiring" && h._tags?.includes("story")
);
if (thread?.objectID) return thread.objectID;
```

### 5d. `extractJobInfo` title parsing loses content after the first pipe

**Lines 684–685**

```ts
const titleParts = titleSegment.split(/[|(]/);
const title = (titleParts[0]?.trim() ?? cleanLine).slice(0, 200).trim();
```

For `"Senior Engineer | Remote | $120k-$150k"`, `titleParts[0]` is `"Senior Engineer"` — correct. But for `"Senior Full-Stack Engineer (TypeScript/React)"`, the `(` split would give `"Senior Full-Stack Engineer"` — the tech stack is lost. This is a design choice but should be documented; the extracted title may lose important parenthetical context.

### 5e. Wellfound scraper `--no-sandbox` on a VPS is a security risk

**Line 849**

`--no-sandbox` disables Chrome's process sandbox. On a VPS this means a compromised page inside the headless browser can escalate to the host process. Consider running the browser in a dedicated low-privilege user or container instead, and keeping the sandbox enabled.

### 5f. `scrapeWellfound` returns `[]` silently on auth wall

**Lines 887–890**

```ts
console.warn("Wellfound requires authentication — no public listings available");
return [];
```

The cron job reports `Upserted 0 jobs` — identical to a successful but empty scrape. Hermes cron prompt says "report how many jobs were found" but zero on auth wall vs zero on empty results are indistinguishable.

Fix: return a distinct signal (throw an error, write to stderr with a non-zero exit, or write `{ source: "wellfound", jobs: [], authWall: true }` to stdout) so the ingest script can log a clear warning.

### 5g. `checkHnStale` calls `fetch(url)` with no timeout

**Lines 1060–1064**

Plain `fetch()` in Node/Bun has no default timeout. A hanging HN request would stall that batch slot indefinitely, delaying the entire stale check run. Pass `signal: AbortSignal.timeout(10_000)`.

---

## 6. Ordering

### 6a. Execution Order table has wrong dependency for Step 4

**Lines 1223–1238 (table)**

The table shows:

| 3 | Start `bunx convex dev` | Step 1 |
| 4 | Run `bunx convex codegen` | **Step 2** |

Step 4 (codegen) depends on Step 3 (dev server running), not Step 2 (schema written). The schema must be written AND the dev server must be running before codegen succeeds. The table should list Step 4's dependency as "Steps 2–3".

### 6b. Schema writing (Step 2) and dev server start (Step 3) can be reordered but table doesn't explain this

**Lines 1226–1227**

The schema can be written before or after starting the dev server — `bunx convex dev` deploys whatever schema exists at the time it syncs. But a reader following the table would write the schema (Step 2), then start the dev server (Step 3), which is functionally correct. The table is not wrong, but the note at line 1243 ("Moved from Step 3 to right after scaffold") refers to the old numbering and contradicts the current table numbering where `convex dev` is Step 3 not Step 1. This note is stale and should be removed or reworded.

### 6c. `convex/jobs.ts` is split across Steps 3 and 4 with no final file view

**Lines 176–244 (Step 3), 338–458 (Step 4)**

Both steps write to `convex/jobs.ts`, but they're presented as separate code blocks. Step 3 shows mutations; Step 4 shows queries plus a continued `import` block. The Step 4 code block starts with a bare `import { query } from "./_generated/server";` (line 339) — which means the implementer must manually merge two code blocks with overlapping imports into one file. The plan should present the final merged `convex/jobs.ts` to avoid merge errors.

### 6d. Step 12 test step has no test commands

**Line 1235**

```
| 12 | Test scrapers + Convex mutations | Steps 5–11 | 15 min |
```

No actual test commands are specified. What does "test" mean here? `bun run scripts/scrape-hn.ts | bun run scripts/ingest.ts`? Manual UI check? A `bun test` suite? For an automated cron system running on a live VPS, the test step needs explicit verification commands and expected output so failures can be distinguished from successes.

---

## Summary Table

| # | Severity | Area | Issue |
|---|----------|------|-------|
| 1a | High | Architecture | `listActiveJobs` unbounded — stale checker will OOM at scale |
| 1b | High | Architecture | Two cron jobs at same schedule violate "sequential" mitigation |
| 2a | **Critical** | Code | `next.config.ts` uses `defineConfig` which doesn't exist in Next.js |
| 2c | High | Code | `staleIds: string[]` should be `Id<"jobs">[]` — TypeScript error |
| 2d | Medium | Code | Browser pages opened for HN jobs that only need `fetch()` |
| 2e | Medium | Code | HN `[dead]`/`[deleted]` posts never marked stale |
| 3a | High | Security | No access control on any Convex function |
| 3b | High | Security | Convex URL embedded in cron prompt strings (logged) |
| 3c | Medium | Security | `--disable-web-security` on live VPS scraper |
| 3e | Medium | Security | `@types/jsdom` missing — silent `any` types in scraper |
| 4a | High | Missing | `convex/auth.config.ts` content never shown |
| 4b | Medium | Missing | `scripts/` directory never created |
| 4e | High | Missing | Frontend pages are skeleton-only (no actual JSX) |
| 4h | High | Missing | Wellfound scraper captures only first page (no scroll/pagination) |
| 5b | High | Scrapers | HN thread search title doesn't match actual HN format |
| 5c | Medium | Scrapers | `findHiringThread` doesn't validate returned hit is a thread |
| 5f | Medium | Scrapers | Auth-wall and empty scrape are indistinguishable (both return 0 jobs) |
| 5g | Medium | Scrapers | `checkHnStale` has no timeout — can hang indefinitely |
| 6a | Medium | Ordering | Execution table Step 4 lists wrong dependency (Step 2, should be Steps 2–3) |
| 6c | Medium | Ordering | `convex/jobs.ts` split across two steps with no merged final view |
| 1c | Medium | Architecture | `listJobs` N+1 — no application data in list response |
| 1e | Medium | Architecture | `search` + `status` args are silently mutually exclusive |
| 2b | Medium | Code | `source` field allows arbitrary strings — should be a union literal |
| 2f | Low | Code | `followUpAt` schema field dead — no mutation or UI sets it |
| 2g | Low | Code | `import.meta.url.endsWith()` — prefer `Bun.main === import.meta.path` |
| 4i | Low | Missing | `remoteStatus` not normalized to canonical values |
| 4j | Low | Missing | Duplicate `JobListing` interface in both scraper files |
| 5e | Low | Scrapers | `--no-sandbox` on VPS process without container isolation |
