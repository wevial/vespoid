import { headers } from "next/headers";
import { accessAssertionFromHeaders } from "@/lib/cloudflare-access";

export const runtime = "edge";

const NO_STORE_HEADERS = {
  "cache-control": "no-store, max-age=0",
  "content-type": "application/json",
};

export async function GET() {
  const assertion = accessAssertionFromHeaders(await headers());
  if (!assertion) {
    return new Response(JSON.stringify({ error: "Cloudflare Access identity is required" }), {
      status: 401,
      headers: NO_STORE_HEADERS,
    });
  }

  return new Response(JSON.stringify({ token: assertion }), { headers: NO_STORE_HEADERS });
}
