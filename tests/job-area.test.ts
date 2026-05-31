import { describe, expect, test } from "bun:test";
import { filterJobsByArea, type JobAreaFilter } from "../src/lib/job-area";

const jobs = [
  { _id: "remote-us", title: "Remote", remoteStatus: "Remote US", location: undefined },
  { _id: "sf", title: "SF", location: "San Francisco", remoteStatus: "hybrid" },
  { _id: "seattle", title: "Seattle", location: "Seattle, WA" },
  { _id: "denver", title: "Denver", location: "Boulder, CO" },
  { _id: "spain", title: "Spain", location: "Madrid, Spain", fitReasons: ["possible Spain eligibility"] },
  { _id: "nyc", title: "NYC", location: "New York", remoteStatus: "onsite" },
];

describe("job area filtering", () => {
  test.each([
    ["all", ["remote-us", "sf", "seattle", "denver", "spain", "nyc"]],
    ["remote", ["remote-us"]],
    ["sf-bay", ["sf"]],
    ["seattle", ["seattle"]],
    ["denver-boulder", ["denver"]],
    ["spain", ["spain"]],
  ] as [JobAreaFilter, string[]][])("filters %s jobs", (area, expectedIds) => {
    expect(filterJobsByArea(jobs, area).map((job) => job._id)).toEqual(expectedIds);
  });
});
