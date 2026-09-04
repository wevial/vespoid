import { describe, expect, test } from "bun:test";
import nextConfig from "../next.config";

const expectedHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
};

describe("global response headers", () => {
  test("applies browser security headers to Worker-rendered pages", async () => {
    expect(nextConfig.headers).toBeFunction();
    const rules = await nextConfig.headers!();
    const globalRule = rules.find((rule) => rule.source === "/:path*");

    expect(globalRule).toBeDefined();
    expect(
      Object.fromEntries(globalRule!.headers.map(({ key, value }) => [key, value])),
    ).toMatchObject(expectedHeaders);
  });
});
