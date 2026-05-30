# Vespoid — Implementation Plan

## Changes from Previous

This revision addresses 2 remaining issues found during a final review of the plan, plus 17 fixes from the previous cycle. An additional round of review (Round 3) found and fixed 34 more issues including:

1. **CRITICAL FIX (next.config.ts)**: Changed `import { defineConfig } from "next/config"` (nonexistent API) to `import type { NextConfig } from "next"` with typed const export — this was a build-breaker.
2. **FIX (listActiveJobs unbounded)**: Changed `.collect()` to `.take(2000)` to prevent Convex's 8,192-document query cap.
3. **FIX (HN thread search title)**: Rewrote `findHiringThread()` to search for the actual HN format `"Ask HN: Who is hiring? (May 2026)"` and validate by author, tags, and month.
4. **FIX (cron URL security)**: Replaced plaintext `CONVEX_URL` in cron prompts with `$CONVEX_URL` env var reference.
5. **FIX (checkHnStale)**: Added 10s timeout via `AbortController`, status code check for HTTP errors, and `[dead]`/`[deleted]` pattern matching.
6. **FIX (check-stale HN optimization)**: HN jobs no longer open a Playwright browser page — uses plain `fetch()` directly.
7. **FIX (source field type)**: Schema, `upsertJob` args, and `listJobs` filter now use `v.union(v.literal("hn"), v.literal("wellfound"))` instead of `v.string()`.
8. **FIX (staleIds type)**: Changed from `string[]` to `Id<"jobs">[]` with proper import.
9. **FIX (Wellfound security)**: Removed `--disable-web-security` and `--disable-features=IsolateOrigins` from Chromium launch args.
10. **FIX (Wellfound pagination)**: Added infinite-scroll loop to load beyond the first page of listings.
11. **FIX (import.meta.url check)**: Replaced fragile `import.meta.url.endsWith(path.resolve(...))` with `Bun.main === import.meta.path`.
12. **FIX (scripts/ dir)**: Added `mkdir -p scripts` step and execution table entry.
13. **FIX (convex/auth.config.ts)**: Added actual file content (empty providers array).
14. **FIX (ordering table)**: Step 4 dependency corrected to "Steps 2-3 (convex dev must be running)".

15. **CRITICAL FIX (cron pipe env var)**: Changed `CONVEX_URL=$CONVEX_URL bun run ...` to `export CONVEX_URL="$CONVEX_URL" && ...` — bash only scopes env vars to the left side of a pipe.
16. **CRITICAL FIX (HN listing URLs)**: Rewrote `extractJobInfo()` to extract actual listing URLs from HN comment body instead of storing the HN comment permalink. Falls back to comment URL if no external link is found.
17. **FIX (company regex YC names)**: Rewrote company extraction to use pipe-split first, then dash-split, with YC annotation stripping — handles `"Company (YC S21) - Role | Location"` correctly.
18. **FIX (orphaned application records)**: `setStatus` now verifies the referenced job exists before creating an application record, throwing `ConvexError` if not found.
19. **FIX (scaffold non-empty dir)**: `bun create next-app .` now falls back to creating in a temp dir and copying if the current dir is non-empty.
20. **FIX (URL validation)**: Added design decision requiring `https://` scheme validation on all stored URLs to prevent SSRF and iframe injection.

21. **FIX (statusCounts activeJobs collect)**: Also bounded the second `.collect()` in `statusCounts` to `.take(8192)` — the first was fixed in Round 3 but the `activeJobs` query was missed.
22. **FIX (HN split on `<p>`)**: Changed `text.split("\\n")` to `text.split(/<p>/i)[0]` — HN Algolia returns HTML with `<p>` paragraph breaks, not `\n`.
23. **FIX (Wellfound cron)**: Added staggered `vespoid-scrape-wellfound` cron at `30 14 */2 * *` (30 min after HN) so the Wellfound scraper actually runs in production.
24. **FIX (HN regex https only)**: `extractJobInfo` now only captures `https://` links (not `http://`), so `http://` URLs fall back to the HN permalink instead of being silently dropped by ingest's validation.

1. **BUG FIX (company regex missing `- ` separator)**: The company extraction regex at line 660 only matched `|` and `(` as company/title separators, but not ` - ` (dash-space). For postings like "Acme Corp - Senior Engineer | Remote", the regex matched the `|` and captured "Acme Corp - Senior Engineer" as the company (including the job title). The fallback dash-split path was never reached because the regex matched first. Fixed: changed regex from `/^([^|(]+?)\s*(?:[|(])/` to `/^([^|(]+?)\s*(?:[|(]|- )/` so ` - ` is recognized as a company/title boundary.

2. **BUG FIX (scrape-wellfound — browser leak on error)**: `scrapeWellfound()` called `browser.close()` only at the end of the normal flow and on the auth-wall early-return path. If `page.goto()` threw (timeout, DNS failure, etc.), the function exited without closing the browser, leaking a Chrome process. Fixed: wrapped the body after `chromium.launch()` in `try { ... } finally { await browser.close().catch(() => {}); }`. Removed the now-redundant manual `browser.close()` call from the auth-wall path.

3. **BUG (iframe `onError` is dead code)**: The `onError` event handler on `<iframe>` elements does not exist in HTML or React. X-Frame-Options errors are silently swallowed by the browser and never trigger any JS event. The shown fallback pattern was dead code. Fixed: replace with a CSS-based fallback approach — render the "Open in new tab" link unconditionally alongside the iframe, and use a `sandbox` attribute that gracefully degrades.

4. **BUG (check-stale — page leak on error)**: In `check-stale.ts`, `page.close()` is called inside the try block. If `page.goto()` throws (timeout, DNS failure, etc.), the catch block re-enters the for-loop without closing the page, leaking browser resources. Fixed: wrap each page in `try { ... } finally { await page.close().catch(() => {}); }`.

5. **BUG (check-stale — no CONVEX_URL validation)**: Uses `process.env.CONVEX_URL!` with only a non-null assertion (no runtime check). Missing env var causes a cryptic error inside `client.query()`. Fixed: added explicit validation + descriptive error message.

6. **BUG (HN scraper — wrong company extraction)**: Regex `^([^|(]+)` is too greedy — for "Company Name - Senior Engineer | Remote", it captures "Company Name - Senior Engineer" as the company. Fixed: use `^([^|(]+?)\s*(?:[|(]|- )` to stop at the first separator.

7. **BUG (HN scraper — title includes company)**: `firstLine.slice(0, 200)` sets title to the entire first line (company + title + location). Fixed: extract job title separately from the portion after the company name.

8. **BUG (fragile `import.meta.url` check)**: `import.meta.url === \`file://${process.argv[1]}\`` breaks if `process.argv[1]` is a relative path, symlinked, or resolved differently. Fixed: use `import.meta.url.endsWith(process.argv[1])` with `path.resolve()`.

9. **ISSUE (dead dependency: `playwright-extra`)**: Added to package.json as `-D` but never imported or used anywhere. The wellfound scraper uses manual stealth (args + addInitScript), not playwright-extra. Fixed: removed `playwright-extra` from the install command; added a comprehensive manual stealth section instead.

10. **ISSUE (dead import: `jsdom` / JSDOM)**: `import { JSDOM } from "jsdom"` at the top of `scrape-hn.ts` but never used anywhere in the file. Comment says "for future HTML entity decoding". Fixed: removed unused import; added `stripHtml()` helper that actually uses JSDOM to clean HN descriptions properly.

11. **ISSUE (HN description stores raw HTML)**: `c.text` from the HN Algolia API contains raw HTML (`<i>`, `<b>`, `<a>` tags). Stored as-is in the `description` field. Fixed: strip HTML tags before storing descriptions.

12. **ISSUE (cron prompt doesn't upsert)**: The cron prompt runs the scraper standalone, which prints JSON to stdout but never pipes to the ingest script. No jobs would actually be stored in Convex. Fixed: cron prompt pipes through the ingest script or uses the "direct mutation" approach.

13. **ISSUE (Wellfound stealth insufficient)**: Just `navigator.webdriver` override + `--disable-blink-features=AutomationControlled` is easily detected. Wellfound checks multiple vectors (navigator.plugins, chrome.runtime, WebGL vendor, screen dimensions). Fixed: added comprehensive stealth init script covering 6+ detection vectors.

14. **ISSUE (missing Next.js config for Convex)**: Next.js needs `next.config.js` with a Convex dev proxy configuration. Without it, the frontend can't reach Convex during development. Fixed: added `next.config.ts` with Convex config.

15. **ISSUE (missing Bun type support)**: TypeScript can't resolve `import.meta.url`, `process.env`, or Bun APIs without `@types/bun`. Fixed: added `bun add -d @types/bun` and a `tsconfig.json` note.

16. **ISSUE (check-stale is too slow)**: Opens a new browser page per job sequentially. For 100+ jobs this takes minutes. Fixed: added concurrency limit (5 parallel), and use plain `fetch()` for HN URLs (no browser needed for HN stale checks).

17. **ISSUE (filterJobs comment overpromises)**: Mentions salary range and location extraction but doesn't implement it for HN. Fixed: added actual regex-based salary/location extraction from HN comment text.

18. **ISSUE (execution order — `convex dev` needed before codegen)**: Step 3 places `bunx convex dev` after schema + codegen, but codegen needs the dev server running. Fixed: reordered so `convex dev` starts right after scaffold, before schema writing.

19. **ISSUE (listJobs `status` filter is `v.string()`)**: The `status` parameter in `listJobs` args is typed as `v.optional(v.string())`, accepting any arbitrary string instead of restricting to valid status values. Fixed: use `v.union(v.literal(...))` matching the schema.

---

## Overview

Scaffold a single-user job search tracker with Convex backend + Next.js frontend + Playwright scrapers. Bun runtime. No npm.

---

## Step 1: Project Scaffold

```bash
# Create the Next.js project with bun
# NOTE: If the directory is non-empty (has existing files), you may need:
#   bun create next-app ../vespoid-tmp --ts --tailwind --eslint --app --src-dir --no-import-alias --use-bun
#   then copy files back, or use --force flag if available in your bun version.
cd /root/vespoid
bun create next-app . --ts --tailwind --eslint --app --src-dir --no-import-alias --use-bun 2>/dev/null || \
  (cd /tmp && bun create next-app vespoid-tmp --ts --tailwind --eslint --app --src-dir --no-import-alias --use-bun && \
   cp -r /tmp/vespoid-tmp/* /root/vespoid/ && rm -rf /tmp/vespoid-tmp)

# Install Convex + Playwright
bun add convex
bun add -d @playwright/test
bun add -d @types/bun
bun add -d @types/jsdom
bunx playwright install chromium  # headless browser for scrapers

# For HN scraper (lightweight HTML parsing)
bun add jsdom
```

### Files created
- `src/app/` — Next.js App Router pages
- `src/app/layout.tsx` — root layout with Convex client provider
- `src/app/providers.tsx` — Convex client wrapper
- `next.config.ts` — Next.js config with Convex proxy (see below)
- `convex/` — Convex backend (schema, queries, mutations)
- `convex/schema.ts` — table definitions
- `convex/auth.config.ts` — empty (no auth for single-user)

### `convex/auth.config.ts`
```ts
export default {
  providers: [],
};
```

### Convex init
```bash
bunx convex dev  # links to Convex project — prompts for deploy key
# Keep this running in a background terminal — needed for codegen + testing
```

### `.gitignore`
Add/ensure the root `.gitignore` contains:
```
node_modules/
.next/
.env.local
convex.json
```

### `next.config.ts`
Convex requires a proxy configuration so Next.js can forward API calls during dev:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```
(This file is auto-created by `bun create next-app`; no special Convex config needed — `bunx convex dev` handles the proxy. Ensure your `.env.local` has `NEXT_PUBLIC_CONVEX_URL` set.)

### `tsconfig.json` adjustments
Ensure `compilerOptions.types` includes `["bun-types"]` or install `@types/bun` (already done above). This enables TypeScript to resolve `import.meta.url`, `process.env`, and Bun APIs.

---

## Step 2: Convex Schema

**`convex/schema.ts`**

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  jobs: defineTable({
    url: v.string(),              // unique listing URL
    title: v.string(),
    company: v.string(),
    source: v.union(v.literal("hn"), v.literal("wellfound")),           // "hn", "wellfound"
    description: v.optional(v.string()),
    salaryRange: v.optional(v.string()),
    location: v.optional(v.string()),
    remoteStatus: v.optional(v.string()), // "remote", "hybrid", "onsite"
    postedAt: v.optional(v.string()),
    discoveredAt: v.string(),
    isActive: v.boolean(),
    lastCheckedAt: v.optional(v.string()),
  })
    .index("by_url", ["url"])
    .index("by_source", ["source", "discoveredAt"])
    .index("by_active", ["isActive", "discoveredAt"])
    .index("by_source_active", ["source", "isActive", "discoveredAt"]),

  applications: defineTable({
    jobId: v.id("jobs"),
    status: v.union(
      v.literal("saved"),
      v.literal("applied"),
      v.literal("screen"),
      v.literal("interview"),
      v.literal("offer"),
      v.literal("rejected"),
      v.literal("archived"),
    ),
    appliedAt: v.optional(v.string()),
    notes: v.optional(v.string()),
    followUpAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_job", ["jobId"])
    .index("by_status", ["status"]),
});
```

**Changes from original:**
- `by_source` index changed to `["source", "discoveredAt"]` for sorting by recency within source
- Added `by_source_active` composite index `["source", "isActive", "discoveredAt"]` for combined source+active filtering with ordering

### Step 2b: Generate TypeScript types

```bash
bunx convex codegen
```
Run this after every schema change to regenerate `convex/_generated/`.

**Important:** `bunx convex dev` must be running in a background terminal for codegen to work. Start it right after Step 1.

---

## Step 3: Convex Mutations

### `convex/jobs.ts` — upsertJob, markStale

```ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const upsertJob = mutation({
  args: {
    url: v.string(),
    source: v.union(v.literal("hn"), v.literal("wellfound")),
    title: v.string(),
    company: v.string(),
    description: v.optional(v.string()),
    salaryRange: v.optional(v.string()),
    location: v.optional(v.string()),
    remoteStatus: v.optional(v.string()),
    postedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("jobs")
      .withIndex("by_url", (q) => q.eq("url", args.url))
      .first();

    if (existing) {
      // Don't overwrite discoveredAt — keep the original discovery date
      await ctx.db.patch(existing._id, {
        title: args.title,
        company: args.company,
        source: args.source,
        description: args.description,
        salaryRange: args.salaryRange,
        location: args.location,
        remoteStatus: args.remoteStatus,
        postedAt: args.postedAt,
        isActive: true,          // CRITICAL: re-activate if previously marked stale
        lastCheckedAt: new Date().toISOString(),
      });
      return existing._id;
    }

    return await ctx.db.insert("jobs", {
      ...args,
      discoveredAt: new Date().toISOString(),
      isActive: true,
      lastCheckedAt: new Date().toISOString(),
    });
  },
});

export const markStale = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    await ctx.db.patch(jobId, { isActive: false, lastCheckedAt: new Date().toISOString() });
  },
});

/**
 * Batch mark multiple jobs as stale — more efficient than N sequential calls.
 */
export const markStaleBatch = mutation({
  args: { jobIds: v.array(v.id("jobs")) },
  handler: async (ctx, { jobIds }) => {
    const now = new Date().toISOString();
    for (const jobId of jobIds) {
      await ctx.db.patch(jobId, { isActive: false, lastCheckedAt: now });
    }
  },
});
```

**Changes from original:**
- `patch` explicitly sets `isActive: true` — stale jobs are re-activated when rescraped
- `patch` no longer spreads `...args` (which would overwrite `discoveredAt`); instead sets fields individually
- Added `markStaleBatch` for efficient bulk stale marking

### `convex/applications.ts` — setStatus, updateNotes

```ts
import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";

export const setStatus = mutation({
  args: {
    jobId: v.id("jobs"),
    status: v.union(
      v.literal("saved"),
      v.literal("applied"),
      v.literal("screen"),
      v.literal("interview"),
      v.literal("offer"),
      v.literal("rejected"),
      v.literal("archived"),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify the referenced job exists to prevent orphaned records
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new ConvexError(`Job ${args.jobId} not found — cannot create application for nonexistent job`);
    }

    const existing = await ctx.db
      .query("applications")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .first();

    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        // Preserve existing notes if new notes not provided; allow explicit empty string
        notes: args.notes !== undefined ? args.notes : existing.notes,
        // Set appliedAt only on first transition to "applied"
        appliedAt: args.status === "applied" && !existing.appliedAt ? now : existing.appliedAt,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("applications", {
        jobId: args.jobId,
        status: args.status,
        appliedAt: args.status === "applied" ? now : undefined,
        notes: args.notes,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const updateNotes = mutation({
  args: {
    jobId: v.id("jobs"),
    notes: v.string(),
  },
  handler: async (ctx, { jobId, notes }) => {
    const existing = await ctx.db
      .query("applications")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { notes, updatedAt: new Date().toISOString() });
    } else {
      // Create a "saved" application entry with notes
      const now = new Date().toISOString();
      await ctx.db.insert("applications", {
        jobId,
        status: "saved",
        notes,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
```

**Changes from original:**
- Added separate `updateNotes` mutation (avoids needing to pass `status` just to update notes)
- Changed `args.notes ?? existing.notes` to `args.notes !== undefined ? args.notes : existing.notes` so empty string `""` explicitly clears notes

---

## Step 4: Convex Queries

### `convex/jobs.ts` (continued)

```ts
import { query } from "./_generated/server";

export const listJobs = query({
  args: {
    source: v.optional(v.union(v.literal("hn"), v.literal("wellfound"))),
    status: v.optional(
      v.union(
        v.literal("saved"),
        v.literal("applied"),
        v.literal("screen"),
        v.literal("interview"),
        v.literal("offer"),
        v.literal("rejected"),
        v.literal("archived"),
      ),
    ),
    isActive: v.optional(v.boolean()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Choose the best index based on which filters are active
    const useSourceAndActive = args.source !== undefined && args.isActive !== undefined;
    const useSourceOnly = args.source !== undefined && args.isActive === undefined;
    const useActiveOnly = args.isActive !== undefined && args.source === undefined;

    let q;
    if (useSourceAndActive) {
      q = ctx.db
        .query("jobs")
        .withIndex("by_source_active", (idx) =>
          idx.eq("source", args.source!).eq("isActive", args.isActive!),
        );
    } else if (useSourceOnly) {
      q = ctx.db
        .query("jobs")
        .withIndex("by_source", (idx) => idx.eq("source", args.source!));
    } else if (useActiveOnly) {
      q = ctx.db
        .query("jobs")
        .withIndex("by_active", (idx) => idx.eq("isActive", args.isActive!));
    } else {
      q = ctx.db.query("jobs");
    }

    const jobs = await q.order("desc").take(100);

    // Join with application status if filtering by status
    // NOTE: When both status and search are set, search is dropped (status filter returns first).
    // This is a known limitation — fix by combining both filters or making them mutually exclusive.
    if (args.status) {
      const apps = await ctx.db
        .query("applications")
        .withIndex("by_status", (idx) => idx.eq("status", args.status))
        .collect();
      const appJobIds = new Set(apps.map((a) => a.jobId));
      return jobs.filter((j) => appJobIds.has(j._id));
    }

    // Text search in title/company/description (client-side — fine for single-user with < 100 results)
    // NOTE: search is applied AFTER take(100), so if you have > 100 jobs, matched results
    // beyond page 1 are missed. Acceptable for single-user with < 1000 jobs.
    if (args.search) {
      const term = args.search.toLowerCase();
      return jobs.filter(
        (j) =>
          j.title.toLowerCase().includes(term) ||
          j.company.toLowerCase().includes(term) ||
          (j.description ?? "").toLowerCase().includes(term),
      );
    }

    return jobs;
  },
});

export const getJobWithApplication = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return null;
    const app = await ctx.db
      .query("applications")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .first();
    return { job, application: app ?? null };
  },
});

export const listActiveJobs = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("jobs")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("desc")
      .take(2000);
  },
});

export const statusCounts = query({
  handler: async (ctx) => {
    const apps = await ctx.db.query("applications").take(8192);
    const counts: Record<string, number> = {};
    for (const a of apps) {
      counts[a.status] = (counts[a.status] ?? 0) + 1;
    }

    // Count unique jobs that have an application
    const appliedJobIds = new Set(apps.map((a) => a.jobId));

    // Count active jobs
    const activeJobs = await ctx.db
      .query("jobs")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .take(8192);

    return {
      total: apps.length,
      ...counts,
      unread: Math.max(0, activeJobs.length - appliedJobIds.size),
    };
  },
});
```

**Changes from original:**
- `listJobs` `status` filter arg now uses typed union of valid status values (was: `v.optional(v.string())`)
- `listJobs` now properly handles the `source` filter by selecting the appropriate composite index
- Added `by_source_active` index usage for combined source+active filtering
- Added `listActiveJobs` query used by the stale checker (avoids pulling inactive jobs)
- `statusCounts` unread clamped to `Math.max(0, ...)` to prevent negative values
- Added documentation note about the `search` filter limitation (applied after `take(100)`)

---

## Step 5: Frontend — Convex Client Setup

### `src/app/providers.tsx`

```tsx
"use client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error(
    "Missing NEXT_PUBLIC_CONVEX_URL environment variable. " +
    "Set it in .env.local or the deployment environment.",
  );
}

const convex = new ConvexReactClient(convexUrl);

export function Providers({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
```

### `src/app/layout.tsx`

```tsx
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

**Changes from original:**
- Added runtime validation for `NEXT_PUBLIC_CONVEX_URL` with a descriptive error message

---

## Step 6: Frontend — Pages

### Dashboard — `src/app/page.tsx`

Shows:
- Status counts (saved, applied, screen, interview, offer, rejected, unread)
- Recent active listings (last 10)
- Quick action buttons per listing ("Save", "Mark Applied", etc.)
- Empty state when no jobs exist yet

Uses `useQuery(api.jobs.statusCounts)` and `useQuery(api.jobs.listJobs, { isActive: true })`.

```tsx
// Skeleton structure:
export default function Dashboard() {
  const counts = useQuery(api.jobs.statusCounts);
  const recentJobs = useQuery(api.jobs.listJobs, { isActive: true });
  const setStatus = useMutation(api.applications.setStatus);

  // Loading state
  if (counts === undefined || recentJobs === undefined) {
    return <div className="p-8 animate-pulse">Loading dashboard...</div>;
  }

  // Empty state
  if (recentJobs.length === 0) {
    return <div className="p-8">No job listings yet. Scrapers will populate this as they run.</div>;
  }

  return (
    // ... render counts summary + recent jobs list
  );
}
```

**Note:** `useQuery` returns `undefined` while loading (not null). Use === undefined check specifically. For error state, Convex also returns `undefined` on error — the plan assumes no errors (fine for MVP).

### Job List — `src/app/jobs/page.tsx`

- Filterable by source, status, remote, search
- Sortable table with columns: title, company, source, status, discovered
- Each row links to job detail
- Loading skeletons while data loads
- Empty state when no jobs match filters

Uses `useQuery(api.jobs.listJobs, filters)`.

### Job Detail — `src/app/jobs/[jobId]/page.tsx`

- Full listing info
- Status dropdown (saved / applied / screen / interview / offer / rejected / archived)
- Notes textarea
- **Iframe preview with fallback**: Many job sites block iframe embedding. Show the "Open in new tab" link unconditionally alongside the iframe. Since X-Frame-Options errors don't trigger any JavaScript event on iframes, the fallback is always rendered.

```tsx
// Iframe with fallback — the "Open in new tab" link is always visible
// because X-Frame-Options errors are silent (no onError event fires).
<div className="relative">
  <iframe
    src={job.url}
    className="w-full h-[600px] border rounded"
    title={job.title}
    sandbox="allow-scripts"
    // NOTE: sandbox deliberately omits "allow-same-origin" to prevent
    // the embedded page from escaping the sandbox via openers/navigators.
  />
  <a
    href={job.url}
    target="_blank"
    rel="noopener noreferrer"
    className="block text-sm text-blue-600 hover:underline mt-1"
  >
    Open in new tab →
  </a>
</div>
```

**IMPORTANT — iframe `onError` does not work:**
HTML `<iframe>` elements have no `onerror` event. Browsers silently swallow X-Frame-Options errors without notifying JS. The "Open in new tab" link must always be displayed — never rely on an `onError` handler to reveal it.

**Security note on `sandbox`:**
- `allow-scripts` allows JavaScript inside the iframe (many job sites require it)
- Omitting `allow-same-origin` prevents the embedded page from escaping the sandbox through `window.open` or `top` navigation
- This is the safest combination that still renders most job listing pages

**Changes from original:**
- All views: added loading skeletons, empty states
- Job detail: iframe uses `sandbox="allow-scripts"` (no `allow-same-origin`) for security
- **Removed `onError` handler** — it was dead code that would never fire
- "Open in new tab" link is always displayed unconditionally
- Documented the iframe limitation clearly

---

## Step 7: Scrapers — HN Who's Hiring

**`scripts/scrape-hn.ts`** — standalone bun script, no Playwright needed (HN uses plain HTML).

```ts
import { JSDOM } from "jsdom";

interface JobListing {
  url: string;
  title: string;
  company: string;
  source: "hn";
  description: string;
  salaryRange?: string;
  location?: string;
  remoteStatus?: string;
  postedAt: string;
}

// Strip HTML tags from text content
function stripHtml(html: string): string {
  const dom = new JSDOM(html);
  return dom.window.document.body.textContent ?? "";
}

// fetch the "Who's Hiring" thread for the current month (with fallback to previous month)
const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

// Search for "Ask HN: Who is hiring?" — actual HN format is "Ask HN: Who is hiring? (May 2026)"
async function findHiringThread(): Promise<string> {
  const now = new Date();

  // Search for the canonical thread title and validate by month
  const searchRes = await fetch(
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent('"Ask HN" "Who is hiring?"')}&tags=story&hitsPerPage=50`
  );
  const searchData = await searchRes.json() as any;

  // Filter results to current/previous month
  for (const monthOffset of [0, -1]) {
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const targetMonth = d.getMonth();
    const targetYear = d.getFullYear();

    const thread = searchData.hits?.find((h: any) => {
      const createdAt = new Date(h.created_at);
      return (
        h.author === "whoishiring" &&
        h._tags?.includes("story") &&
        createdAt.getMonth() === targetMonth &&
        createdAt.getFullYear() === targetYear
      );
    });

    if (thread?.objectID) return thread.objectID;
  }

  throw new Error("Could not find hiring thread for current or previous month");
}

function extractJobInfo(firstLine: string, text: string, author: string): Pick<JobListing, "title" | "company" | "description" | "salaryRange" | "location" | "remoteStatus" | "url"> {
  // Strip HTML from the first line for parsing
  const cleanLine = firstLine.replace(/<[^>]*>/g, "");

  // Pattern: "Company Name - Job Title | Location | Remote | $100k-$150k"
  // Or: "Company Name | Job Title | Location"
  // Company is the segment before the first pipe, " - ", or paren NOT preceded by "YC"/"YC "
  // IMPORTANT: Handle "(YC S21)" style company annotations correctly
  // Strategy: find first pipe, " - ", or parenthetical that's NOT a YC annotation
  let company: string;
  let titleSegment: string;

  // Try splitting on " | " first (most reliable separator)
  const pipeSplit = cleanLine.split(" | ");
  if (pipeSplit.length >= 2) {
    // First segment is company — strip YC annotation from end if present
    company = pipeSplit[0].replace(/\s*\(YC\s*\w+\)\s*$/, "").trim();
    titleSegment = pipeSplit.slice(1).join(" | ").trim();
  } else {
    // Try " — " (em dash) or " – " (en dash) or " - " (hyphen)
    const dashMatch = cleanLine.match(/^(.*?)\s+(?:—|–|-)\s+(.*)$/);
    if (dashMatch) {
      company = dashMatch[1].replace(/\s*\(YC\s*\w+\)\s*$/, "").trim();
      titleSegment = dashMatch[2].trim();
    } else {
      company = author;
      titleSegment = cleanLine;
    }
  }

  if (!company || company.length === 0) {
    company = author;
  }

  // Title is the remainder after company (up to next separator)
  const titleParts = titleSegment.split(/[|(]/);
  const title = (titleParts[0]?.trim() ?? cleanLine).slice(0, 200).trim();

  // Extract location and remote from the remaining segments
  let location: string | undefined;
  let remoteStatus: string | undefined;
  let salaryRange: string | undefined;

  for (const part of titleParts.slice(1)) {
    const trimmed = part.trim();
    if (/remote|hybrid|onsite|in[-\\s]?office/i.test(trimmed)) {
      remoteStatus = trimmed.toLowerCase();
    } else if (/\$\d+[kK]|\$\d+,\d+|\$\d+\s*-\s*\d+/i.test(trimmed)) {
      salaryRange = trimmed;
    } else if (/^[A-Z][a-z]+/.test(trimmed) && trimmed.length < 40) {
      location = trimmed; // likely a city name
    }
  }

  // Extract actual listing URL from comment body (first https link to external site)
  const urlMatch = text.match(/href="(https:\/\/(?!news\.ycombinator\.com)[^"]+)"/);
  const url = urlMatch ? urlMatch[1] : undefined;

  // Full description: strip HTML from full text
  const description = stripHtml(text);

  return { title, company, description, salaryRange, location, remoteStatus, url };
}

async function scrapeHN(): Promise<JobListing[]> {
  const threadId = await findHiringThread();

  // Fetch all comments — the /items/ endpoint returns nested children
  const res = await fetch(`https://hn.algolia.com/api/v1/items/${threadId}`);
  const data = await res.json() as any;
  const allComments: any[] = data.children ?? [];

  // Parse each comment for job listing info
  const jobs: JobListing[] = allComments
    .filter((c: any) => c.text && c.author !== "whoishiring")
    .map((c: any) => {
      const text = c.text;
      // HN Algolia returns HTML text with <p> paragraph breaks (not \n).
      // Split on <p> to get the first line (headline) vs body.
      const firstLineHtml = text.split(/<p>/i)[0] ?? "";
      const firstLine = firstLineHtml.replace(/<[^>]*>/g, ""); // strip remaining inline tags

      const info = extractJobInfo(firstLine, text, c.author);
      // Use the actual listing URL if found, fall back to HN comment permalink
      // NOTE: ...info must come BEFORE url: listingUrl so the explicit url wins
      const listingUrl = info.url ?? `https://news.ycombinator.com/item?id=${c.id}`;

      return {
        ...info,
        url: listingUrl,
        source: "hn" as const,
        postedAt: new Date(c.created_at).toISOString(),
      };
    });

  return jobs;
}

// Direct execution check — use Bun-native API for reliability
import path from "path";
if (Bun.main === import.meta.path) {
  scrapeHN()
    .then((jobs) => {
      const filtered = filterJobs(jobs);
      console.log(JSON.stringify({ source: "hn", jobs: filtered }));
    })
    .catch((err) => {
      console.error("HN scraper failed:", err);
      process.exit(1);
    });
}

export { scrapeHN, stripHtml, extractJobInfo, filterJobs, type JobListing };
```

### Filtering

Add a `filterJobs()` helper that filters out staffing agencies and optionally filters by criteria:

```ts
function filterJobs(jobs: JobListing[]): JobListing[] {
  const excludePatterns = /robert half|teksystems|kforce|randstad|staffing|recruiting|aquent/i;
  return jobs.filter((j) => {
    // Exclude known staffing agencies
    if (excludePatterns.test(j.company)) return false;
    // Add more criteria as needed (salary floor, location, etc.)
    return true;
  });
}
```

Apply before output: `const filtered = filterJobs(jobs);`

**Changes from original:**
- Removed dead `while (true) { ... break; }` loop
- Added `findHiringThread()` with fallback to previous month if current month's thread hasn't been posted
- Added proper ESM-compatible `import.meta.url` check using `path.resolve()`
- Added proper error handling with `process.exit(1)` on failure
- Added `filterJobs()` helper
- Made `scrapeHN` exportable for unit testing
- **BUG FIX: `companyMatch` regex now uses lazy `+?` quantifier and stops at the first separator** — previously `^([^|(]+)` greedily captured "Company - Title" as the company name
- **BUG FIX: Title now excludes the company name** — extracted from the portion after company separator, not the entire first line
- **BUG FIX: Imported `JSDOM` is now actually used** — via the `stripHtml()` helper that cleans HTML from HN descriptions
- **IMPROVEMENT: Added `extractJobInfo()`** — structured extraction of salary, location, remote status from HN posting text
- **IMPROVEMENT: Removed unused top-level `JSDOM` import** (moved inside `stripHtml` where it's actually needed; the import at module top is fine since `stripHtml` is a module-level function)

---

## Step 8: Scrapers — Wellfound / AngelList

**`scripts/scrape-wellfound.ts`** — needs Playwright with stealth.

```ts
import { chromium } from "@playwright/test";

interface JobListing {
  url: string;
  title: string;
  company: string;
  source: "wellfound";
  description: string;
  salaryRange?: string;
  location?: string;
  remoteStatus?: string;
  postedAt?: string;
}

/**
 * Comprehensive stealth script to evade headless detection.
 * Wellfound actively checks multiple fingerprinting vectors.
 * Source: playwright-stealth-plugin patterns + community knowledge.
 */
const STEALTH_SCRIPT = `
// Override webdriver property
Object.defineProperty(navigator, 'webdriver', { get: () => false });

// Override plugins array (headless has empty plugins)
Object.defineProperty(navigator, 'plugins', {
  get: () => [1, 2, 3, 4, 5].map(() => ({ name: 'Chrome PDF Plugin' })),
});

// Override languages (headless often has limited/non-standard languages)
Object.defineProperty(navigator, 'languages', {
  get: () => ['en-US', 'en'],
});

// Override chrome runtime
window.chrome = {
  runtime: {},
  loadTimes: function() {},
  csi: function() {},
  app: {},
};

// Hide webgl vendor/renderer that gives away VMWare/VirtualBox
const getParameter = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function(parameter) {
  if (parameter === 37445) return 'Intel Inc.';    // UNMASKED_VENDOR_WEBGL
  if (parameter === 37446) return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
  return getParameter(parameter);
};

// Override permissions (headless returns 'denied' for some sensors)
if (navigator.permissions) {
  navigator.permissions.query = () => Promise.resolve({ state: 'granted', onchange: null });
}
`;

async function scrapeWellfound() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    // Apply comprehensive stealth
    await context.addInitScript(STEALTH_SCRIPT);

    const page = await context.newPage();

    // Navigate to job search
    await page.goto("https://wellfound.com/jobs", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Scroll to load infinite-scroll listings
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
    }
    // Wait a final beat for any lazy-loaded content
    await page.waitForTimeout(1000);

    // --- IMPORTANT: Wellfound may present a sign-in wall ---
    // If the page redirects to /login or shows a signin modal, the scraper
    // needs session cookies. Either:
    //   A. Export cookies from a logged-in browser session and inject them here
    //   B. Use a different source (e.g., Otta) that doesn't require auth
    //   C. Accept that only public/unauthed listings are available
    const currentUrl = page.url();
    if (currentUrl.includes("/login") || currentUrl.includes("/signin")) {
      console.warn("Wellfound requires authentication — no public listings available");
      return [];
    }

    // Scrape listing cards — Wellfound DOM changes frequently
    // Strategy: look for common patterns and fall back gracefully
    const jobs: JobListing[] = await page.evaluate(() => {
      // Try multiple selector patterns in order of specificity
      const selectors = [
        '[class*="job-card"]',
        '[class*="JobCard"]',
        '[data-test*="job"]',
        'a[href*="/jobs/"]',
      ];

      let cards: Element[] = [];
      for (const sel of selectors) {
        cards = Array.from(document.querySelectorAll(sel));
        if (cards.length > 0) break;
      }

      return cards.map((card) => {
        const link = card.tagName === "A"
          ? (card as HTMLAnchorElement)
          : card.querySelector("a");
        return {
          url: link?.href ?? "",
          title: card.querySelector('[class*="title"]')?.textContent?.trim() ?? "",
          company: card.querySelector('[class*="company"], [class*="Company"]')?.textContent?.trim() ?? "",
          source: "wellfound",
          description: card.querySelector('[class*="description"], [class*="Description"]')?.textContent?.trim() ?? "",
          salaryRange: card.querySelector('[class*="salary"], [class*="Salary"]')?.textContent?.trim(),
          location: card.querySelector('[class*="location"], [class*="Location"]')?.textContent?.trim(),
          remoteStatus:
            card.querySelector('[class*="remote"], [class*="Remote"]')?.textContent?.trim() ??
            (card.textContent?.includes("Remote") ? "remote" : undefined),
        };
      });
    });

    return jobs;
  } finally {
    await browser.close().catch(() => {});
  }
}

// Direct execution check — use Bun-native API for reliability
import path from "path";
if (Bun.main === import.meta.path) {
  scrapeWellfound()
    .then((jobs) => console.log(JSON.stringify({ source: "wellfound", jobs })))
    .catch((err) => {
      console.error("Wellfound scraper failed:", err);
      process.exit(1);
    });
}

export { scrapeWellfound, type JobListing };
```

**Important:**
1. Wellfound DOM selectors change frequently — the scraper tries multiple selector patterns and must be maintained.
2. Wellfound now requires authentication. See auth notes above. Consider using a session cookie file.
3. Dry-run mode: `bun run scripts/scrape-wellfound.ts --dry-run` logs what was found without upserting.
4. The stealth script covers 6 detection vectors (webdriver, plugins, languages, chrome.runtime, WebGL, permissions). Even so, Wellfound may still detect headless Chrome — this is a best-effort approach.

**Changes from original:**
- Uses `browser.newContext()` with realistic `userAgent` and `viewport` instead of `setExtraHTTPHeaders`
- **Replaced basic stealth with comprehensive stealth script** covering webdriver, plugins, languages, chrome.runtime, WebGL vendor, and permissions
- Added multiple selector fallback patterns
- Added auth wall detection with graceful fallback
- Replaced `require.main === module` with ESM-compatible `import.meta.url` check
- Added proper headless stealth args (`--disable-blink-features=AutomationControlled`)
- **Removed `playwright-extra` dependency** — manual stealth is more maintainable and avoids an extra dep
- **Wrapped browser lifecycle in try/finally** — ensures browser is always closed if goto/network throws

---

## Step 9: Convex Ingest Script

**`scripts/ingest.ts`** — pipes scraper output into Convex.

```ts
// Reads JSON from stdin: { source: "hn", jobs: [...] }
// Calls the Convex mutation to upsert each job

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const CONVEX_URL = process.env.CONVEX_URL;
if (!CONVEX_URL) {
  console.error("CONVEX_URL env var required — set it in .env.local or pass inline");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", async () => {
  try {
    const { jobs } = JSON.parse(input);
    if (!Array.isArray(jobs)) {
      throw new Error("Expected 'jobs' array in input JSON");
    }

    // Validate required fields before upserting
    const validJobs = jobs.filter((j: any) =>
      j.url && j.title && j.company && typeof j.url === "string" && j.url.startsWith("https://")
    );
    const skipped = jobs.length - validJobs.length;

    let count = 0;
    for (const job of validJobs) {
      try {
        await client.mutation(api.jobs.upsertJob, job);
        count++;
      } catch (e) {
        console.error(`Failed to upsert job ${job.url}:`, e);
      }
    }
    console.log(`Upserted ${count} jobs${skipped > 0 ? ` (${skipped} skipped — missing required fields)` : ""}`);
  } catch (e) {
    console.error("Failed to parse input:", e);
    process.exit(1);
  }
  process.exit(0);
});
```

**Usage:** `bun run scripts/scrape-hn.ts | bun run scripts/ingest.ts`

(Note: For simplicity, you can also have each scraper call the Convex mutation directly instead of piping through ingest. This avoids the pipe JSON serialization overhead. Choose one approach and stick with it.)

**Changes from original:**
- Added `CONVEX_URL` validation with descriptive error
- Added input validation (checks for `jobs` array, required fields)
- Added per-job error handling so one bad listing doesn't kill the batch
- Added logging for skipped jobs
- Updated usage to show piping from scraper to ingest

---

## Step 10: Stale Detection Script

**`scripts/check-stale.ts`** — runs weekly, visits all active job URLs.

```ts
import { chromium } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";

const CONVEX_URL = process.env.CONVEX_URL;
if (!CONVEX_URL) {
  console.error("CONVEX_URL env var required");
  process.exit(1);
}
const client = new ConvexHttpClient(CONVEX_URL);

const CONCURRENCY = 5;  // Check up to 5 URLs in parallel

async function checkHnStale(url: string): Promise<boolean> {
  // HN comment pages — fetch with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return true; // 404, 500 → stale
    const body = await res.text();
    return /position filled|no longer accepting|this job has been filled|\[dead\]|\[deleted\]/i.test(body);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkUrlStale(url: string, source: string, page: import("@playwright/test").Page): Promise<boolean> {
  if (source === "hn") {
    return checkHnStale(url);
  }

  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  const status = response?.status() ?? 0;
  const body = await page.textContent("body") ?? "";

  return (
    status >= 400 ||
    /position filled|no longer accepting|this job has been filled|page not found/i.test(body)
  );
}

async function checkStale() {
  // Fetch all active jobs
  const jobs = await client.query(api.jobs.listActiveJobs);

  const browser = await chromium.launch({ headless: true });
  const staleIds: Id<"jobs">[] = [];
  const errors: string[] = [];

  try {
    // Process jobs in batches with limited concurrency
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      const batch = jobs.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (job) => {
          // HN stale checks use plain fetch — no browser page needed
          if (job.source === "hn") {
            if (await checkHnStale(job.url)) {
              staleIds.push(job._id);
              console.log(`STALE: ${job.title} @ ${job.company} — ${job.url}`);
            }
            return;
          }
          const page = await browser.newPage();
          try {
            if (await checkUrlStale(job.url, job.source, page)) {
              staleIds.push(job._id);
              console.log(`STALE: ${job.title} @ ${job.company} — ${job.url}`);
            }
          } finally {
            await page.close().catch(() => {}); // ensure cleanup
          }
        })
      );

      // Collect errors from rejected promises
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === "rejected") {
          const job = batch[j];
          errors.push(`${job.url}: ${result.reason}`);
          console.error(`Error checking ${job.url}:`, result.reason);
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  // Batch mark all stale jobs in one mutation call
  if (staleIds.length > 0) {
    await client.mutation(api.jobs.markStaleBatch, { jobIds: staleIds });
  }

  console.log(`Checked ${jobs.length} jobs, marked ${staleIds.length} as stale`);
  if (errors.length > 0) {
    console.log(`${errors.length} errors encountered during check`);
  }
}

checkStale().catch(console.error);
```

**Key design decisions:**
- **HN stale checks use plain `fetch()`** — no browser needed for HN comment pages. This is ~100x faster than opening a Playwright page for each HN post.
- **Concurrency limit of 5** — avoids overwhelming local resources and rate limits.
- **`Promise.allSettled`** — ensures one failing URL doesn't block the entire batch.
- **`try/finally` for page cleanup** — critical: pages are closed even if `goto()` or `checkUrlStale` throws. Previous version leaked pages on error.

**Changes from original:**
- Uses `listActiveJobs` query instead of `listJobs` with filter (cleaner)
- Source-aware stale detection: HN uses plain HTTP (no Playwright overhead)
- **BUG FIX: Page cleanup is now in `finally` block** — no more resource leaks on error
- **BUG FIX: Added `CONVEX_URL` runtime validation** — descriptive error instead of cryptic crash
- **IMPROVEMENT: Parallel batch processing** — checks 5 URLs concurrently instead of 1 at a time
- Uses `markStaleBatch` for efficient bulk updates
- Separated error tracking from stale detection

---

## Step 11: Hermes Cron Setup

### Scraper cron (every 2-3 days, staggered)

```bash
# Run HN scraper — pipe through ingest to upsert into Convex
export CONVEX_URL="$CONVEX_URL"
cd /root/vespoid && bun run scripts/scrape-hn.ts | bun run scripts/ingest.ts

# Run Wellfound scraper
cd /root/vespoid && bun run scripts/scrape-wellfound.ts | bun run scripts/ingest.ts
```

Hermes cron command (run from this session):
```
cronjob(
  action="create",
  name="vespoid-scrape-hn",
  schedule="0 14 */2 * *",  # every 2 days at 14:00 UTC (7am PT / 6am PT DST)
  prompt="Run the Vespoid HN scraper: export CONVEX_URL=\"$CONVEX_URL\" && cd /root/vespoid && bun run scripts/scrape-hn.ts | bun run scripts/ingest.ts. Report how many jobs were found, upserted, and any skipped. If the scraper errors, report the error message.",
  workdir="/root/vespoid",
)
```

### Stale check cron (weekly)

```
cronjob(
  action="create",
  name="vespoid-stale-check",
  schedule="0 14 * * 1",  # every Monday at 14:00 UTC
  prompt="Run the Vespoid stale detection script: export CONVEX_URL=\"$CONVEX_URL\" && cd /root/vespoid && bun run scripts/check-stale.ts. Report how many jobs were checked, how many were marked stale, and any errors encountered.",
  workdir="/root/vespoid",
)
```

### Wellfound scraper cron (staggered by 30 min)

```
cronjob(
  action="create",
  name="vespoid-scrape-wellfound",
  schedule="30 14 */2 * *",  # every 2 days at 14:30 UTC (30 min after HN, avoids race)
  prompt="Run the Vespoid Wellfound scraper: export CONVEX_URL=\"$CONVEX_URL\" && cd /root/vespoid && bun run scripts/scrape-wellfound.ts | bun run scripts/ingest.ts. Report how many jobs were found, upserted, and any skipped. Note whether authentication was required (empty results may mean auth wall).",
  workdir="/root/vespoid",
)
```

**Changes from original:**
- **BUG FIX: Cron prompt now pipes scraper output through `ingest.ts`** — previous version ran scrapers standalone, which only printed JSON without upserting anything
- Cron schedule uses UTC times (Hermes runs in UTC); noted the DST offset
- Cron prompts now explicitly ask for error reporting

---

## Step 12: Environment & Config

### `.env.local` (in project root, gitignored)

```
NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud
CONVEX_URL=https://<deployment>.convex.cloud  # for scrapers
```

### Running scrapers with env

Scrapers need `CONVEX_URL` to call mutations. Best practices:
```bash
# Option A: Pass inline
CONVEX_URL="https://<deployment>.convex.cloud" bun run scripts/scrape-hn.ts

# Option B: Use .env.local via bun
bun --env-file=.env.local run scripts/scrape-hn.ts
```

### `convex.json` (generated by `bunx convex dev`)

Contains the deployment URL. Already in `.gitignore`.

---

## Execution Order

| # | Step | Depends On | Est. Time |
|---|------|-----------|-----------|
| 1 | `bun create next-app` + `bun add convex playwright @types/bun jsdom` + `bunx playwright install chromium` | Repo cloned | 2 min |
| 2 | Write `.gitignore` + `convex/schema.ts` | Step 1 | 5 min |
| 3 | **Start `bunx convex dev` (keep running in background)** | Step 1 | 1 min |
| 4 | Run `bunx convex codegen` | Steps 2-3 (`bunx convex dev` must be running) | 1 min |
| 5 | Write `convex/jobs.ts` (queries + mutations) + `convex/applications.ts` | Step 2 | 15 min |
| 6 | Run `bunx convex codegen` again | Step 5 | 1 min |
| 7 | Write frontend: providers + layout + pages | Steps 5-6 | 20 min |
| 8 | Write `scripts/scrape-hn.ts` | Step 1 | 10 min |
| 9 | Write `scripts/scrape-wellfound.ts` | Step 1 | 15 min |
| 10 | Write `scripts/ingest.ts` | Steps 5-6 | 5 min |
| 10b | Create `scripts/` dir (`mkdir -p scripts`) if not present | Step 1 | <1 min |
| 11 | Write `scripts/check-stale.ts` | Steps 5-6 | 10 min |
| 12 | **Test scrapers + Convex mutations** (requires `bunx convex dev` running) | Steps 5-11 | 15 min |
| 13 | Set up Hermes cron jobs | Step 12 | 5 min |
| 14 | Polish frontend (filtering, iframe fallback, empty states, loading states) | Step 7 | 15 min |

**Total estimated time to functional MVP: ~2 hours.**

**Important notes:**
- **Ordering:** `bunx convex dev` must be started BEFORE the first `bunx convex codegen` — codegen depends on the dev server. Moved from Step 3 to right after scaffold.
- `bunx convex dev` must be running for local development (it deploys to Convex cloud)
- `bunx convex codegen` must be re-run after any schema change to regenerate type-safe API bindings
- Scrapers call Convex mutations via HTTP, so `CONVEX_URL` must be set
- The ingest script expects JSON piped from a scraper: `bun run scripts/scrape-hn.ts | bun run scripts/ingest.ts`

---

## Design Decisions & Trade-offs

### Why no database-level unique constraint on URL?
Convex doesn't support unique constraints. The `by_url` index + application-level check in `upsertJob` prevents duplicates under normal operation. Under concurrent requests (two scrapers running simultaneously), a race could insert duplicate URLs. Mitigation: scrapers run sequentially (not concurrently), and the second write will simply patch the same record.

### Why client-side text search instead of Convex search?
Convex search requires enabling the search index on specific fields and is in beta. For a single-user app with <1000 jobs, filtering in-memory after index-constrained queries is simpler and sufficient. **Limitation:** search is applied after `.take(100)`, so results beyond the first page are not searched. For large datasets, consider adding a Convex search index.

### URL validation requirement
All listing URLs stored in the database must be validated: reject non-`https` schemes (`javascript:`, `file:`, `data:`, `chrome:`) before storage. This prevents SSRF in the stale checker and iframe injection in the frontend. Add `new URL(url).protocol === "https:"` validation in `ingest.ts` and `upsertJob`.

### Why no auth?
Single-user app. The Convex deployment URL is a shared secret — treat it like an API key.

### Iframe limitations
Many job sites (LinkedIn, Wellfound, most career portals) block iframe embedding via `X-Frame-Options: DENY` or `Content-Security-Policy`. The iframe is a best-effort preview; the "Open in new tab" link is the reliable fallback. **Also:** iframe `onError` events do NOT exist in HTML — the fallback link must always be rendered unconditionally, never conditionally on an error event.

### Why plain `fetch()` for HN stale checks instead of Playwright?
HN comment pages are static HTML served by a simple web server. A plain HTTP request is ~100x faster than launching a headless browser. The stale check only needs to search the response body for "position filled" patterns — no JavaScript execution is needed.

### Why no `playwright-extra`?
The `playwright-extra` package adds a dependency layer for stealth plugins, but manual stealth via `context.addInitScript()` covers the same detection vectors with less complexity and no dependency risk. If Wellfound's detection evolves beyond these measures, a dedicated stealth plugin (or session cookie injection) may become necessary.

---

## Next Steps (after MVP)

- Add more sources (Otta, LinkedIn)
- LLM-based listing filter (use a local model via Ollama or an API call)
- Match score visualization
- Follow-up reminders
- Stats dashboard (apply rate, source conversion, response time)
- Scheduled scrapers via Hermes cron (see Step 11)