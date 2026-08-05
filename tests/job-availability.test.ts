import { describe, expect, test } from "bun:test";
import { classifyAvailabilityFromHttpResult } from "../src/lib/job-availability";

describe("job availability classification", () => {
  test("marks missing listing pages as closed", () => {
    expect(classifyAvailabilityFromHttpResult(404, "not found")).toEqual({
      status: "closed",
      reason: "listing returned HTTP 404",
    });
  });

  test("detects common closed listing copy", () => {
    const result = classifyAvailabilityFromHttpResult(200, "This job is no longer accepting applications.");
    expect(result.status).toBe("closed");
    expect(result.reason).toContain("closed-listing text");
  });

  test("detects open apply copy", () => {
    const result = classifyAvailabilityFromHttpResult(200, "Ready to apply for this job? Submit application below.");
    expect(result.status).toBe("open");
    expect(result.reason).toContain("application text");
  });

  test("keeps inconclusive pages unknown", () => {
    expect(classifyAvailabilityFromHttpResult(200, "Careers at Acme")).toEqual({
      status: "unknown",
      reason: "no definitive open/closed text found",
    });
  });

  test("treats transient server failures as unknown instead of closed", () => {
    expect(classifyAvailabilityFromHttpResult(503, "temporarily unavailable")).toEqual({
      status: "unknown",
      reason: "listing returned HTTP 503",
    });
  });
});
