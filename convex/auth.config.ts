import type { AuthConfig } from "convex/server";

const cloudflareAccessAudience = process.env.CLOUDFLARE_ACCESS_AUD;
if (!cloudflareAccessAudience) {
  throw new Error("CLOUDFLARE_ACCESS_AUD is required to pin Cloudflare Access JWTs to jobs.weevil.sh");
}

export default {
  providers: [
    {
      type: "customJwt",
      applicationID: cloudflareAccessAudience,
      issuer: "https://misty-credit-c592.cloudflareaccess.com",
      jwks: "https://misty-credit-c592.cloudflareaccess.com/cdn-cgi/access/certs",
      algorithm: "RS256",
    },
  ],
} satisfies AuthConfig;
