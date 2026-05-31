import { describe, expect, test } from "bun:test";
import { nextPreviewJobId, selectedPreviewJob } from "../src/lib/job-preview-panel";

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
});
