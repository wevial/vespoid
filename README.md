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

### Authorization configuration

Cloudflare Access protects the Worker hostname, but Convex validates every direct data call independently. Before deploying, set `CLOUDFLARE_ACCESS_AUD` to the Audience (AUD) tag of the existing `jobs.weevil.sh` Access application; this pins accepted JWTs to this application rather than accepting tokens issued for another Access app.

Local ingestion also requires a Cloudflare Access service token named `vespoid-local-ingestion`, with a **Service Auth** policy on that same Access application. Keep its credentials outside the repository and provide them only to the local job runner. Set its non-secret Client ID on the Convex production deployment so Convex can allow exactly that machine identity:

```bash
bunx convex env set --prod VESPOID_INGESTION_SERVICE_CLIENT_ID "<Cloudflare Access Client ID>"

export VESPOID_CF_ACCESS_CLIENT_ID="<same Client ID>"
export VESPOID_CF_ACCESS_CLIENT_SECRET="…"
```

The scripts exchange those credentials only with the protected Worker endpoint for a short-lived Access assertion, then use that assertion for Convex. Do not use a Convex admin/deploy key or place either service-token value in a Worker variable.

```bash
bun run deploy:cloudflare
```

The only production route is `https://jobs.weevil.sh`, protected by its existing Cloudflare Access application. The Worker-owned `workers.dev` route and preview URLs are disabled so the application cannot bypass Access through an alternate hostname.
