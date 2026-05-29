# Vespoid

> A personal job search co-pilot — Playwright-powered scraping + Convex + Next.js

Vespoid is a single-user web app that gathers job listings tailored to **one person's criteria** and tracks where you are in the pipeline with each one. Think of it as a tiny CRM for your career search, where the feed is curated by nightly Hermes cron jobs running Playwright against your chosen job sources.

## Why

Job hunting today means bouncing between LinkedIn, Wellfound, HN Who's Hiring, Otta, and a dozen company career pages — checking the same feeds, re-reading the same listings, and keeping mental track of what you've applied to. Vespoid centralises that into a single dashboard where:

- New listings appear automatically (filtered to your criteria)
- You click a button to mark saved → applied → screen → interview → offer / rejected / archived
- Each listing opens in an iframe so you can verify it's still live without leaving the app
- Stale listings (no longer accepting applications) are detected and flagged weekly

## Architecture

```
┌─────────────────────┐       nightly cron (every 2-3d)      ┌──────────────┐
│  Hermes Agent (VPS) │  ──────────────────────────────────▶  │  Convex      │
│  Playwright          │  calls convex mutation upsertJob()   │  (DB + API)  │
│  scrapers            │                                       │              │
│  (HN, Wellfound…)    │                                       └──────┬───────┘
└─────────────────────┘                                              │
                                                                     │ real-time sync
                                                                     ▼
                                                            ┌─────────────────────┐
                                                            │  Next.js App        │
                                                            │  (bun + Convex SDK)  │
                                                            │  - Dashboard         │
                                                            │  - Filterable list   │
                                                            │  - iframe preview    │
                                                            │  - Status CRUD       │
                                                            └─────────────────────┘
```

### Data Flow

1. **Hermes cron** runs a Playwright script per job source (HN Who's Hiring, Wellfound, etc.) every 2-3 days
2. Each scraper extracts: title, company, URL, location, salary range, remote status, posted date
3. Results are upserted into Convex via `convex/mutators` (deduped by listing URL)
4. **Weekly stale detection cron** visits known listing URLs and marks `is_active: false` if the page returns 404 / "position filled"
5. The Next.js frontend subscribes to Convex queries in real-time — no polling, no API routes

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Scraping** | Playwright (Node.js) | JS-heavy job portals (Wellfound, LinkedIn); reliable anti-detection |
| **Scheduling** | Hermes cron (VPS) | Already running on the same machine; no infra to manage |
| **Backend / DB** | Convex | Real-time sync built in, no server management, free tier handles single-user |
| **Frontend** | Next.js + Convex SDK | Familiar stack; Convex SDK handles all client-server reactivity |
| **Runtime** | bun | Faster installs, better DX, single binary |
| **Iframe** | Native `<iframe>` | Quick check if a listing is still live |

## Sources (Planned)

### Phase 1 (MVP)
- **HN Who's Hiring** — plain HTML, no JS, trivially scrapable with `cheerio` or regex
- **Wellfound / AngelList** — JS-heavy, needs Playwright with stealth

### Phase 2
- Otta — JS-heavy, similar pattern to Wellfound
- LinkedIn — aggressive anti-bot; may need Playwright + extra stealth

### Future
- Company career pages (individually configured)
- Custom RSS feeds / newsletters

## Filtering & Tailoring

Each scraper passes raw listings through a **prompt-based filter** before upserting. The filter prompt evolves over time — you give it criteria and we improve it together. Initial criteria:

- **Salary floor**: minimum listed salary must include ≥ $170k in the range or go above it
- **Location**: Seattle, San Francisco, or remote (US)
- **Experience**: matches the user's general seniority level
- **Role focus**: relevant to the user's domain (AI/ML, full-stack, platform)
- Excludes known staffing agencies and certain companies

The filter can be a simple keyword matcher for v0, graduating to an LLM-based classifier if simple rules prove insufficient.

## Data Model (Convex Schema)

```
jobs:
  - _id, url (unique), title, company, source
  - description, salary_range, location, remote_status
  - posted_at, discovered_at, is_active, last_checked_at

applications:
  - _id, job_id (FK)
  - status: saved | applied | screen | interview | offer | rejected | archived
  - applied_at, notes, follow_up_at
  - created_at, updated_at
```

Queries: list by status, by source, by remote status, by recency. Full-text search on title/company/description.

## Implementation Plan (Draft)

### 1. Project Scaffold
- `bun create next-app` with TypeScript
- `bunx convex dev` to init Convex
- Convex schema (`schema.ts`) for jobs + applications
- Basic Convex queries + mutations (upsertJob, updateStatus, listJobs)

### 2. Frontend (v0)
- Dashboard: recent listings, status counts, quick actions
- Job list page: sortable/filterable table/cards
- Detail view: listing info + iframe preview + status controls
- Convex reactivity: all views update in real-time

### 3. Scrapers (Hermes Skills)
- Each source = a standalone Node.js script using Playwright
- Scripts run via `bun` for consistency
- Output: JSON array of listings → piped into convex mutation
- Hermes cron: every 2-3 days
- Hermes cron: weekly stale check

### 4. Stale Detection
- Weekly cron: visit each active listing URL
- If 404 / "not found" / "position filled" → mark `is_active = false`

### 5. Polish
- Match score (simple heuristic or LLM estimate)
- Stats page (apply rate, source conversion, time-to-response)
- Follow-up reminders

## Development

```bash
# Prerequisites
bun --version  # require ≥ 1.2

# Clone
git clone https://github.com/wevial/vespoid.git
cd vespoid

# Install deps
bun install

# Start Convex (requires Convex account + project)
bunx convex dev

# Run dev server
bun run dev
```

**No npm** — this project uses bun exclusively.

## Running Scrapers

```bash
# Via bun directly
bun run scripts/scrape-hn.ts
bun run scripts/scrape-wellfound.ts

# Via Hermes (scheduled)
# Hermes cron handles scheduling; scripts call Convex mutation directly
```

## Status

**Phase: Planning.** Not implemented yet.