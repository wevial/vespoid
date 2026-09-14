import { ConvexHttpClient } from "convex/browser";

const ACCESS_TOKEN_URL = process.env.VESPOID_ACCESS_TOKEN_URL ?? "https://jobs.weevil.sh/api/auth/convex-token";

type AccessTokenResponse = { token?: unknown };

export async function createIngestionClient(convexUrl: string): Promise<ConvexHttpClient> {
  const clientId = process.env.VESPOID_CF_ACCESS_CLIENT_ID;
  const clientSecret = process.env.VESPOID_CF_ACCESS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("VESPOID_CF_ACCESS_CLIENT_ID and VESPOID_CF_ACCESS_CLIENT_SECRET are required for local ingestion");
  }

  const response = await fetch(ACCESS_TOKEN_URL, {
    cache: "no-store",
    redirect: "manual",
    headers: {
      "CF-Access-Client-Id": clientId,
      "CF-Access-Client-Secret": clientSecret,
    },
  });
  const rawPayload = await response.text();
  let payload: AccessTokenResponse;
  try {
    payload = JSON.parse(rawPayload) as AccessTokenResponse;
  } catch {
    throw new Error(
      `Cloudflare Access service authentication failed (HTTP ${response.status}). `
      + "Confirm the jobs.weevil.sh application has a Service Auth policy for vespoid-local-ingestion.",
    );
  }
  if (!response.ok || typeof payload.token !== "string" || payload.token.length === 0) {
    throw new Error("Cloudflare Access did not issue a service-token assertion for Vespoid ingestion");
  }

  return new ConvexHttpClient(convexUrl, { auth: payload.token });
}
