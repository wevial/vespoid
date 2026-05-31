import { describe, expect, test } from "bun:test";
import { DEFAULT_JOB_LIST_FILTERS, jobListFiltersFromSearchParams, jobListFiltersToSearchParams } from "../src/lib/job-list-query";

describe("job list URL query state", () => {
  test("round-trips non-default filters so browser back restores listing state", () => {
    const query = jobListFiltersToSearchParams({
      source: "hn",
      status: "saved",
      remote: "remote",
      search: "react ai",
      sort: "salary-desc",
      area: "sf-bay",
    });

    expect(query.toString()).toContain("source=hn");
    expect(query.toString()).toContain("status=saved");
    expect(query.toString()).toContain("remote=remote");
    expect(query.toString()).toContain("q=react+ai");
    expect(query.toString()).toContain("sort=salary-desc");
    expect(query.toString()).toContain("area=sf-bay");

    expect(jobListFiltersFromSearchParams(query)).toEqual({
      source: "hn",
      status: "saved",
      remote: "remote",
      search: "react ai",
      sort: "salary-desc",
      area: "sf-bay",
    });
  });

  test("drops default values from the URL", () => {
    expect(jobListFiltersToSearchParams(DEFAULT_JOB_LIST_FILTERS).toString()).toBe("");
  });
});
