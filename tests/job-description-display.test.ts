import { describe, expect, test } from "bun:test";
import { descriptionNeedsExpansion, getCollapsedDescription } from "../src/lib/job-description-display";

describe("job description display", () => {
  test("collapses long descriptions at a word boundary", () => {
    const description = `${"A".repeat(120)} ${"B".repeat(120)} ${"C".repeat(120)}`;

    const collapsed = getCollapsedDescription(description, 260);

    expect(collapsed.endsWith("…")).toBe(true);
    expect(collapsed.length).toBeLessThanOrEqual(261);
    expect(collapsed).not.toContain("C".repeat(120));
  });

  test("does not collapse short descriptions", () => {
    const description = "Short listing description.";

    expect(descriptionNeedsExpansion(description, 260)).toBe(false);
    expect(getCollapsedDescription(description, 260)).toBe(description);
  });
});
