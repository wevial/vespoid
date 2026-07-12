import { describe, expect, test } from "bun:test";
import { clampPreviewPanelWidth, nextPreviewJobId, selectedPreviewJob } from "../src/lib/job-preview-panel";

const jobs = [
  { _id: "job-a", title: "Frontend Engineer" },
  { _id: "job-b", title: "Product Engineer" },
];

describe("job preview panel state", () => {
  test("selects a clicked job for preview", () => {
    expect(nextPreviewJobId(undefined, "job-a")).toBe("job-a");
  });

  test("clicking the selected preview job closes the panel", () => {
    expect(nextPreviewJobId("job-a", "job-a")).toBeUndefined();
  });

  test("resolves the selected job from the currently visible list", () => {
    expect(selectedPreviewJob(jobs, "job-b")).toEqual(jobs[1]);
    expect(selectedPreviewJob(jobs, "missing")).toBeUndefined();
  });

  test("converts a dragged left edge into a clamped right-side panel width", () => {
    expect(clampPreviewPanelWidth({ clientX: 700, viewportWidth: 1200 })).toBe(500);
    expect(clampPreviewPanelWidth({ clientX: 1100, viewportWidth: 1200 })).toBe(360);
    expect(clampPreviewPanelWidth({ clientX: 50, viewportWidth: 1200 })).toBe(1020);
  });
});
