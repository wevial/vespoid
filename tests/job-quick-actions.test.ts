import { describe, expect, test } from "bun:test";
import { isQuickActionActive, QUICK_TRIAGE_ACTIONS } from "../src/lib/job-quick-actions";

describe("job quick triage actions", () => {
  test("exposes the three fast triage actions in scan order", () => {
    expect(QUICK_TRIAGE_ACTIONS.map((action) => action.status)).toEqual(["saved", "applied", "archived"]);
    expect(QUICK_TRIAGE_ACTIONS.map((action) => action.label)).toEqual(["Save", "Applied", "Archive"]);
  });

  test("marks only the current application status as active", () => {
    expect(isQuickActionActive("saved", "saved")).toBe(true);
    expect(isQuickActionActive("saved", "applied")).toBe(false);
    expect(isQuickActionActive("archived", null)).toBe(false);
  });
});
