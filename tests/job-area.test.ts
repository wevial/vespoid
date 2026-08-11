import { describe, expect, test } from "bun:test";
import { filterJobsByArea, type JobAreaFilter } from "../src/lib/job-area";

const jobs = [
  { _id: "remote-us", title: "Remote", remoteStatus: "Remote US", location: undefined },
  { _id: "remote-us-sf-preferred", title: "Remote US with SF preference", location: "Remote US (SF Bay Area preferred)", remoteStatus: "remote" },
  { _id: "us-region-remote", title: "United States remote", location: "United States", remoteStatus: "remote" },
  { _id: "remote-us-hybrid", title: "Remote US hybrid", location: "San Francisco / Remote US", remoteStatus: "hybrid" },
  { _id: "sf-city-list-remote", title: "SF city list remote", location: "San Francisco, CA, US / Seattle, WA, US / Remote (San Francisco, CA, US; Seattle, WA, US)", remoteStatus: "remote" },
  { _id: "sf-local-remote", title: "SF local remote", location: "Remote (San Francisco, CA; Oakland, CA)", remoteStatus: "remote" },
  { _id: "sf", title: "SF", location: "San Francisco", remoteStatus: "hybrid" },
  { _id: "seattle", title: "Seattle", location: "Seattle, WA" },
  { _id: "kirkland", title: "Kirkland", location: "Kirkland, WA" },
  { _id: "washington", title: "Washington", location: "Washington State" },
  { _id: "denver", title: "Denver", location: "Boulder, CO" },
  { _id: "spain", title: "Spain", location: "Madrid, Spain", fitReasons: ["possible Spain eligibility"] },
  { _id: "nyc", title: "NYC", location: "New York", remoteStatus: "onsite" },
];

describe("job area filtering", () => {
  test.each([
    ["all", ["remote-us", "remote-us-sf-preferred", "us-region-remote", "remote-us-hybrid", "sf-city-list-remote", "sf-local-remote", "sf", "seattle", "kirkland", "washington", "denver", "spain", "nyc"]],
    ["remote", ["remote-us", "remote-us-sf-preferred", "us-region-remote"]],
    ["sf-bay", ["remote-us-sf-preferred", "remote-us-hybrid", "sf-city-list-remote", "sf-local-remote", "sf"]],
    ["seattle", ["sf-city-list-remote", "seattle", "kirkland", "washington"]],
    ["denver-boulder", ["denver"]],
  ] as [JobAreaFilter, string[]][])("filters %s jobs", (area, expectedIds) => {
    expect(filterJobsByArea(jobs, area).map((job) => job._id)).toEqual(expectedIds);
  });
});
