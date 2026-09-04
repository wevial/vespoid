# Vespoid 🐝

A personal job search co-pilot. Scrapes tailored listings via Playwright, tracks application statuses, single-user.

**Read the full spec:** [PROJECT.md](./PROJECT.md)

## Quick Start

```bash
git clone https://github.com/wevial/vespoid.git
cd vespoid
bun install
bunx convex dev
bun run dev
```

**Status:** Planning phase.

---

Built with Convex + Next.js + Playwright + bun. No npm.

## Cloudflare deployment

The interactive Next.js application runs on Cloudflare Workers through the OpenNext adapter. Convex remains the managed data backend, while local Playwright ingestion jobs continue to write to Convex independently of the web host. `NEXT_PUBLIC_CONVEX_URL` must be present at build time because Next.js inlines it into the Worker bundle.

```bash
bun run deploy:cloudflare
```

The only production route is `https://jobs.weevil.sh`, protected by its existing Cloudflare Access application. The Worker-owned `workers.dev` route and preview URLs are disabled so the application cannot bypass Access through an alternate hostname.
