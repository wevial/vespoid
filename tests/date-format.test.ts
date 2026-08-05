import { describe, expect, test } from "bun:test";
import { formatDateLabel } from "../src/lib/date-format";

describe("date label formatting", () => {
  test("formats ISO dates for display", () => {
    expect(formatDateLabel("2026-05-31T16:24:53.173Z", { month: "short", day: "numeric", year: "numeric" })).toBe("May 31, 2026");
  });

  test("returns relative YC date labels instead of throwing", () => {
    expect(formatDateLabel("6 months", { dateStyle: "medium" })).toBe("6 months");
    expect(formatDateLabel("4 months", { month: "short", day: "numeric" })).toBe("4 months");
  });

  test("uses fallback for missing dates", () => {
    expect(formatDateLabel(undefined, { dateStyle: "medium" })).toBe("Unknown");
  });
});
