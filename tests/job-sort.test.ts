import { describe, expect, test } from "bun:test";
import { sortJobs, type JobSortOption } from "../src/lib/job-sort";

const jobs = [
  {
    _id: "low-old",
    title: "Low Old",
    company: "A",
    discoveredAt: "2026-05-01T00:00:00.000Z",
    postedAt: "2026-04-30T00:00:00.000Z",
    salaryRange: "$150k - $170k",
    fitScore: 9,
  },
  {
    _id: "high-older",
    title: "High Older",
    company: "B",
    discoveredAt: "2026-05-02T00:00:00.000Z",
    postedAt: "2026-04-29T00:00:00.000Z",
    salaryRange: "$180k - $260k",
    fitScore: 7,
  },
  {
    _id: "unknown-new",
    title: "Unknown New",
    company: "C",
    discoveredAt: "2026-05-03T00:00:00.000Z",
    fitScore: 14,
  },
];

describe("job sorting", () => {
  test("sorts by fit score by default", () => {
    expect(sortJobs(jobs, "fit").map((job) => job._id)).toEqual(["unknown-new", "low-old", "high-older"]);
  });

  test("sorts by listed/discovered date newest first", () => {
    expect(sortJobs(jobs, "date-desc").map((job) => job._id)).toEqual(["unknown-new", "high-older", "low-old"]);
  });

  test("sorts by salary high-to-low and places unknown salary last", () => {
    expect(sortJobs(jobs, "salary-desc").map((job) => job._id)).toEqual(["high-older", "low-old", "unknown-new"]);
  });

  test("keeps input immutable", () => {
    const original = jobs.map((job) => job._id);
    sortJobs(jobs, "salary-desc" satisfies JobSortOption);
    expect(jobs.map((job) => job._id)).toEqual(original);
  });
});
