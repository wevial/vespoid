# Findings

## Cloudflare Access / Convex authorization

- The Cloudflare Worker hostname is protected by Access, but browser-to-Convex calls bypass that hostname. Convex must independently validate the Cloudflare Access JWT and every public Convex handler must require the single authorized identity.
- The required issuer is `https://misty-credit-c592.cloudflareaccess.com`, observed from the live `jobs.weevil.sh` Access redirect.
- The supplied `jobs.weevil.sh` Access Audience (AUD) tag must be configured as `CLOUDFLARE_ACCESS_AUD` on the Convex production deployment. Omitting audience validation would accept a JWT minted for another Access application.
- Local scraper/ingestion jobs require a dedicated Access service token named `vespoid-local-ingestion`, with a **Service Auth** policy on the existing Access application. Cloudflare puts the service token's **Client ID** (not its display name) in the signed JWT `common_name` claim, so Convex must receive that non-secret ID as `VESPOID_INGESTION_SERVICE_CLIENT_ID`. The Client ID and secret remain local runner environment variables (`VESPOID_CF_ACCESS_CLIENT_ID` and `VESPOID_CF_ACCESS_CLIENT_SECRET`); neither is committed or configured in the Worker.
- Independent authorization review found no public Convex bypass: every public `jobs` and `applications` handler requires authorization, while query helpers are internal-only. The review confirmed the service-token gap is fail-closed until its Client ID and secret are configured.
- Deployment verification: `CLOUDFLARE_ACCESS_AUD` is set on both the production and active dev Convex deployments; active Vespoid data deployment is `third-chickadee-512`. `bun test` passed (149 tests); `bun run typecheck` and `bun run build` passed. Direct production-equivalent calls without a JWT return `Unauthorized`; malformed bearer tokens return HTTP 401. The ingestion bootstrap fails closed without service-token credentials.
