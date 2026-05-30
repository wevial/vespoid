# Vespoid PLAN.md — Codex Review (Round 2)

Reviewer: OpenAI Codex (gpt-5.5, medium effort)
Date: 2026-05-30
Focus: Issues not already covered in review-claude-1.md

---

## 1. Architecture & Pipeline

### 1a. Cron pipeline env var scoping bug
The cron prompt runs:
```bash
CONVEX_URL=$CONVEX_URL bun run scripts/scrape-hn.ts | bun run scripts/ingest.ts
```
In bash, `CONVEX_URL=$CONVEX_URL` is environment-scoped to the *left side* of the pipe only (the scraper). `ingest.ts` runs without `CONVEX_URL` set and will fail at the validation check or use a different value. **Fix:** export the variable globally or wrap:
```bash
export CONVEX_URL="$CONVEX_URL"
bun run scripts/scrape-hn.ts | bun run scripts/ingest.ts
```

### 1b. Convex URL cannot be treated as a secret
`NEXT_PUBLIC_CONVEX_URL` is exposed to every browser client via Next.js server-side rendering. Any user who opens the frontend can read it from the page source. The plan says "treat Convex URL as a shared secret" (design decisions) but the NEXT_PUBLIC_ prefix inherently publishes it. This contradicts itself — if the URL is the only auth, publishing it makes auth nonexistent.

### 1c. ListJobs search+status interaction still broken
`listJobs` applies `.take(100)` before filtering by status. When filtering by status AND isActive, valid older jobs that match the status but fall after page 1 are silently dropped. The plan acknowledges this but offers no fix — it's a correctness bug, not a performance trade-off.

### 1d. README/PROJECT/PLAN disagree on ingest architecture
PROJECT.md says scrapers "upsert into Convex via convex/mutators" (direct mutation). PLAN.md Step 11 uses a pipe through `ingest.ts`. Step 9 presents a "Better approach" of direct mutation. Three different architectures in the same repo. Should converge on one.

### 1e. statusCounts still uses unbounded .collect()
`statusCounts` does `ctx.db.query("applications").collect()` with no `.take()` limit. Same class of bug as the fixed `listActiveJobs`. Needs `.take(8192)` or cursor pagination.

---

## 2. Scraper Issues

### 2a. HN scraper stores wrong URL
The scraper stores `https://news.ycombinator.com/item?id=${c.id}` — the **HN comment URL**, not the actual job listing URL. This means:
- The iframe shows the HN comment page, not the company's job posting
- Stale detection checks the HN comment (which never 404s), not the actual listing page
- Dedup by URL means the same job posted twice gets two entries

### 2b. Company regex breaks on YC-style company names
For `"Company Name (YC S21) - Senior Engineer | Remote"`, the regex `^([^|(]+?)\s*(?:[|(]|- )` stops at the first `(` — treating `(YC S21)` as the start of the job title. Company becomes `"Company Name "` and title becomes `"YC S21) - Senior Engineer"`.

### 2c. Filtering defined but not always applied
Step 7 defines `filterJobs()` but the "direct execution check" at the bottom outputs all jobs unfiltered. Only the exported `scrapeHN()` function would use it when called from ingest, but the standalone path bypasses it.

### 2d. Wellfound dry-run and session auth are documented skeletons
The plan mentions dry-run mode and session cookie injection but shows no implementation of either.

### 2e. Stale checker launches Chromium unconditionally
If all jobs are from HN, a full Chromium browser is still launched (and immediately closed). Wasteful.

---

## 3. Security

### 3a. Untrusted URLs rendered/stored without validation
URLs from HN comments and scraped pages are stored directly in the database and:
- Rendered in `<iframe src={job.url}>` — could be `javascript:` or `file:` URLs
- Fetched in `checkUrlStale` — could point to internal services (SSRF)
- Stored as-is with no scheme validation

Fix: validate URL starts with `https://` before storing; reject `javascript:`, `file:`, `data:`, `chrome:` schemes.

### 3b. Orphaned application records
`setStatus` and `updateNotes` create application records without verifying the `jobId` references an existing job. If `ingest.ts` fails mid-batch or a job is deleted, applications become orphaned with no cleanup path.

---

## 4. Implementation Ordering

### 4a. `bun create next-app .` may fail on non-empty directory
The repo already has files (PROJECT.md, PLAN.md, README.md, .git). `bun create next-app .` may refuse to scaffold into a non-empty directory. The plan should handle this: either create the project elsewhere and copy, or use `--force`.

### 4b. No test plan at all
Step 12 says "Test scrapers + Convex mutations" but provides no actual test scripts, expected outputs, or verification criteria. For an automation-heavy app that runs headlessly on a VPS, this is a gap.

---

## Summary of Critical Findings

| # | Severity | Area | Issue |
|---|----------|------|-------|
| 1a | **Critical** | Pipeline | Cron pipe scopes CONVEX_URL to left side only — ingest.ts fails silently |
| 1b | High | Architecture | NEXT_PUBLIC_CONVEX_URL inherently public, contradicts "secret" claim |
| 2a | **Critical** | Scrapers | HN scraper stores comment URLs, not listing URLs — breaks everything downstream |
| 2b | High | Scrapers | Company regex breaks on `(YC S21)` style names |
| 3a | High | Security | No URL scheme validation — SSRF/iframe injection risk |
| 3b | Medium | Database | Orphaned application records when jobId doesn't exist |
| 4a | Medium | Tooling | `bun create next-app .` fails on non-empty directory |
| 1e | Medium | Schema | statusCounts unbounded .collect() on applications table |
