import { describe, expect, test } from "bun:test";
import { buildJobListScrollKey, parseSavedScrollY } from "../src/lib/job-list-scroll";

describe("job list scroll restoration", () => {
  test("keys saved scroll by full jobs list URL so each filter state restores independently", () => {
    expect(buildJobListScrollKey("/jobs", "?area=remote&sort=salary-desc")).toBe("vespoid:jobs-scroll:/jobs?area=remote&sort=salary-desc");
    expect(buildJobListScrollKey("/jobs", "")).toBe("vespoid:jobs-scroll:/jobs");
  });

  test("accepts only finite non-negative saved scroll positions", () => {
    expect(parseSavedScrollY("420")).toBe(420);
    expect(parseSavedScrollY("0")).toBe(0);
    expect(parseSavedScrollY("-1")).toBeUndefined();
    expect(parseSavedScrollY("NaN")).toBeUndefined();
    expect(parseSavedScrollY(null)).toBeUndefined();
  });
});
