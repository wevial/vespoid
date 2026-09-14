import { describe, expect, test } from "bun:test";
import { selectWeeklyRecommendations } from "../src/lib/weekly-recommendations";

const baseJob = {
  company: "Example",
  source: "company_board",
  isActive: true,
  title: "Product Engineer",
  fitScore: 10,
  fitReasons: ["target role"],
};

describe("weekly homepage recommendations", () => {
  test("groups the top five active, untriaged jobs into every target location", () => {
    const recommendations = selectWeeklyRecommendations([
      { ...baseJob, _id: "remote-high", title: "AI Product Engineer", fitScore: 14, location: "Remote US", remoteStatus: "remote" },
      { ...baseJob, _id: "remote-low", title: "Product Engineer", fitScore: 8, location: "Remote US", remoteStatus: "remote" },
      { ...baseJob, _id: "seattle", title: "Frontend Engineer", fitScore: 12, location: "Seattle, WA" },
      { ...baseJob, _id: "sf", title: "Full Stack Engineer", fitScore: 11, location: "San Francisco, CA" },
      { ...baseJob, _id: "denver", title: "Developer Tools Engineer", fitScore: 10, location: "Denver, CO" },
      { ...baseJob, _id: "saved", title: "Already Saved", fitScore: 99, location: "Remote US", remoteStatus: "remote" },
      { ...baseJob, _id: "inactive", title: "Inactive", fitScore: 99, isActive: false, location: "Seattle, WA" },
    ], [
      { status: "saved", job: { ...baseJob, _id: "saved", location: "Remote US", remoteStatus: "remote" } },
    ]);

    expect(recommendations.map((group) => group.area)).toEqual(["remote", "seattle", "sf-bay", "denver-boulder"]);
    expect(recommendations[0].jobs.map((job) => job._id)).toEqual(["remote-high", "remote-low"]);
    expect(recommendations[1].jobs.map((job) => job._id)).toEqual(["seattle"]);
    expect(recommendations[2].jobs.map((job) => job._id)).toEqual(["sf"]);
    expect(recommendations[3].jobs.map((job) => job._id)).toEqual(["denver"]);
  });

  test("caps every area at five recommendations", () => {
    const recommendations = selectWeeklyRecommendations(
      Array.from({ length: 6 }, (_, index) => ({
        ...baseJob,
        _id: `remote-${index}`,
        title: `Product Engineer ${index}`,
        fitScore: index,
        location: "Remote US",
        remoteStatus: "remote",
      })),
      [],
    );

    expect(recommendations[0].jobs).toHaveLength(5);
    expect(recommendations[0].jobs.map((job) => job._id)).toEqual(["remote-5", "remote-4", "remote-3", "remote-2", "remote-1"]);
  });

  test("uses saved and applied history to personalize the order", () => {
    const recommendations = selectWeeklyRecommendations([
      { ...baseJob, _id: "generic", title: "Product Engineer", fitScore: 10, location: "Remote US", remoteStatus: "remote" },
      { ...baseJob, _id: "devtools", title: "Developer Tools Engineer", fitScore: 10, location: "Remote US", remoteStatus: "remote" },
      { ...baseJob, _id: "past-saved", title: "Developer Tools Engineer", fitScore: 10, location: "Seattle, WA" },
    ], [
      { status: "saved", job: { ...baseJob, _id: "past-saved", title: "Developer Tools Engineer", location: "Seattle, WA" } },
    ]);

    expect(recommendations[0].jobs.map((job) => job._id)).toEqual(["devtools", "generic"]);
    expect(recommendations[0].jobs[0].preferenceReasons).toContain("similar to saved/applied roles");
  });
});
