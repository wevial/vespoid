import { NextRequest, NextResponse } from "next/server";
import { accessAssertionFromHeaders } from "@/lib/cloudflare-access";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store, max-age=0" };

export async function GET(request: NextRequest) {
  const assertion = accessAssertionFromHeaders(request.headers);
  if (!assertion) {
    return NextResponse.json(
      { error: "Cloudflare Access identity is required" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json({ token: assertion }, { headers: NO_STORE_HEADERS });
}
