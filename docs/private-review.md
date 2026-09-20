# Private review

`/review` reads `/api/review/dataset`. Only after the existing Convex JWT + owner/service authorization succeeds does the Worker load and return the server-only corpus. Every response is no-store. No labels or production job state are written to Convex. A backend outage fails closed.

## Build/deploy prerequisite
The repository is public: **never commit the curated corpus**. Before building, place the approved schema-1 dataset in `src/server/review-dataset.json` (gitignored, mode 0600). The deployed corpus has 84 stored public listings, fingerprint `692bde5f842cff69f187cf955d8ee16b5988a981b03f9241ec0a499665be1da9`. This input belongs only in the Worker server bundle, never public, `.next/static`, or `.open-next/assets`. Missing input intentionally blocks a build. Keep a private backup for subsequent deploys. Worker only; no Convex deployment/schema change.

## Labels and migration
Labels are browser-local, not cloud synced or server backed up. Export JSON before changing browsers or clearing site storage. The standalone file origin cannot automatically transfer localStorage: export its v1 JSON, open Review, then Import JSON. Imports validate the sample fingerprint, source hashes and chronological event history; replacement requires confirmation. v2 exports distinguish `labeled`, `skipped` and `unlabeled`. A skip has null label and is never a neutral or negative training example. Z undoes both decisions and skips, including after completion. Corrupt storage or concurrent-tab changes preserve existing bytes and switch the current tab to memory-only; export before leaving.

The corpus is stored scraped text, not an iframe or fresh scrape. Original completeness/availability and novelty against all prior user exposure are not verified. No predictions, prior human labels, or scores are shown. No ingestion, inference, backfill, availability checks, or application mutations occur.
