import { describe, expect, test } from "bun:test";
import { getQuickActionButtonTone, isQuickActionActive, QUICK_TRIAGE_ACTIONS } from "../src/lib/job-quick-actions";

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

  test("gives each quick action a prominent distinct color tone without glow", () => {
    expect(getQuickActionButtonTone("saved", false)).toContain("bg-amber-400/18");
    expect(getQuickActionButtonTone("applied", false)).toContain("bg-emerald-400/18");
    expect(getQuickActionButtonTone("archived", false)).toContain("bg-rose-400/18");
    expect(getQuickActionButtonTone("saved", true)).toContain("bg-amber-300/32");
    expect(getQuickActionButtonTone("saved", false)).not.toContain("shadow");
    expect(getQuickActionButtonTone("applied", false)).not.toContain("shadow");
    expect(getQuickActionButtonTone("archived", false)).not.toContain("shadow");
    expect(getQuickActionButtonTone("saved", true)).not.toContain("shadow");
  });
});
