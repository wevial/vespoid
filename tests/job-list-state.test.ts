import { describe, expect, test } from "bun:test";
import { beginJobListFilterGeneration, isCurrentRequestGeneration, removeJobFromPages } from "../src/lib/job-list-state";

describe("job list mutation state", () => {
  test("starts a new filter generation with Load More available", () => {
    expect(beginJobListFilterGeneration(4)).toEqual({
      generation: 5,
      isLoadingMore: false,
    });
  });

  test("rejects a load-more response from an older request generation", () => {
    const oldGeneration = 4;
    const currentGeneration = oldGeneration + 1;

    expect(isCurrentRequestGeneration(oldGeneration, currentGeneration)).toBe(false);
    expect(isCurrentRequestGeneration(currentGeneration, currentGeneration)).toBe(true);
  });

  test("removes one job from loaded pages and closes its preview", () => {
    const result = removeJobFromPages(
      [
        [{ _id: "job-a" }, { _id: "job-b" }],
        [{ _id: "job-c" }, { _id: "job-d" }],
      ],
      "job-c",
      "job-c",
    );

    expect(result.pages).toEqual([
      [{ _id: "job-a" }, { _id: "job-b" }],
      [{ _id: "job-d" }],
    ]);
    expect(result.previewJobId).toBeUndefined();
  });
});
