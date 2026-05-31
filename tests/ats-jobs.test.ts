import { describe, expect, test } from "bun:test";
import { mapAshbyJob, mapGreenhouseJob, mapLeverPosting } from "../src/lib/ats-jobs";

describe("ATS company-board mapping", () => {
  test("maps a target Ashby job from a curated company board", () => {
    const job = mapAshbyJob(
      "linear",
      {
        title: "Senior Product Engineer, AI",
        location: "Remote (US) / San Francisco / New York",
        department: "Engineering",
        jobUrl: "https://linear.app/careers/abc",
        descriptionHtml: "Build AI workflows with TypeScript, React, and APIs. Salary $190k - $240k.",
        compensation: { compensationTierSummary: "$190K - $240K" },
      },
      "Linear",
    );

    expect(job).toMatchObject({
      source: "company_board",
      company: "Linear",
      title: "Senior Product Engineer, AI",
      url: "https://linear.app/careers/abc",
      salaryRange: "$190K - $240K",
      remoteStatus: "remote",
    });
    expect(job?.fitScore).toBeGreaterThanOrEqual(9);
    expect(job?.fitReasons).toContain("target role");
  });

  test("maps a target Lever posting and filters unrelated roles", () => {
    const target = mapLeverPosting("vercel", {
      text: "Senior Frontend Engineer, AI SDK",
      hostedUrl: "https://jobs.lever.co/vercel/frontend",
      categories: { team: "Engineering", location: "Remote - United States", commitment: "Full-time" },
      descriptionPlain: "React, Next.js, TypeScript, developer tools, SDKs. $180,000 - $230,000.",
      lists: [],
    });
    const rejected = mapLeverPosting("vercel", {
      text: "Product Marketing Manager",
      hostedUrl: "https://jobs.lever.co/vercel/marketing",
      categories: { team: "Marketing", location: "Remote - United States", commitment: "Full-time" },
      descriptionPlain: "Launch products.",
      lists: [],
    });

    expect(target?.source).toBe("company_board");
    expect(target?.company).toBe("Vercel");
    expect(rejected).toBeUndefined();
  });

  test("maps a Greenhouse posting with absolute board URL", () => {
    const job = mapGreenhouseJob("supabase", {
      title: "Staff Software Engineer, Platform",
      absolute_url: "https://job-boards.greenhouse.io/supabase/jobs/123",
      location: { name: "Remote - US" },
      content: "Build APIs, TypeScript tooling, and data platform infrastructure. $190k-$230k.",
      departments: [{ name: "Engineering" }],
    });

    expect(job).toMatchObject({
      source: "company_board",
      company: "Supabase",
      remoteStatus: "remote",
    });
  });
});
