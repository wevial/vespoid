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

  test("honors Ashby's explicit remote metadata when the location is country-wide", () => {
    const job = mapAshbyJob(
      "socket",
      {
        title: "Forward Deployed Engineer, Python",
        location: "United States",
        isRemote: true,
        workplaceType: "Remote",
        department: "Customer Engineering",
        jobUrl: "https://jobs.ashbyhq.com/socket/fde",
        descriptionPlain: "Build Python developer tools and AI security workflows with customers. This role is remote with customer onsite engagements.",
        compensation: { compensationTierSummary: "$125K - $200K" },
      },
      "Socket",
    );

    expect(job).toMatchObject({
      company: "Socket",
      location: "United States",
      remoteStatus: "remote",
    });
  });

  test("does not label hybrid, office-required, or city-only postings as broadly remote", () => {
    const hybrid = mapAshbyJob(
      "openai",
      {
        title: "Software Engineer, Product",
        location: "Seattle",
        department: "Engineering",
        jobUrl: "https://jobs.ashbyhq.com/openai/hybrid",
        descriptionPlain: "Build TypeScript and React product systems. This role uses a hybrid work model of 3 days in the office per week. Salary $230K - $385K.",
        compensation: { compensationTierSummary: "$230K - $385K" },
      },
      "OpenAI",
    );
    const onsite = mapAshbyJob(
      "openai",
      {
        title: "Software Engineer, Ads Manager",
        location: "Seattle",
        department: "Engineering",
        jobUrl: "https://jobs.ashbyhq.com/openai/onsite",
        descriptionPlain: "Build TypeScript and React product systems. This role is exclusively based in our Seattle office. We offer relocation assistance. Salary $230K - $385K.",
        compensation: { compensationTierSummary: "$230K - $385K" },
      },
      "OpenAI",
    );
    const cityOnly = mapAshbyJob(
      "openai",
      {
        title: "Software Engineer, Codex App",
        location: "San Francisco",
        department: "Engineering",
        jobUrl: "https://jobs.ashbyhq.com/openai/sf",
        descriptionPlain: "Build TypeScript and React product systems. Collaborate with remote teams. Salary $230K - $385K.",
        compensation: { compensationTierSummary: "$230K - $385K" },
      },
      "OpenAI",
    );

    expect(hybrid?.remoteStatus).toBe("hybrid");
    expect(onsite?.remoteStatus).toBe("onsite");
    expect(cityOnly?.remoteStatus).toBeUndefined();
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

  test("decodes Greenhouse escaped HTML content before storing descriptions", () => {
    const job = mapGreenhouseJob("anthropic", {
      title: "Staff Software Engineer, AI Reliability",
      absolute_url: "https://job-boards.greenhouse.io/anthropic/jobs/5113224008",
      location: { name: "San Francisco, CA | New York City, NY | Seattle, WA" },
      content: "&lt;div class=&quot;content-intro&quot;&gt;&lt;h2&gt;&lt;strong&gt;About Anthropic&lt;/strong&gt;&lt;/h2&gt;&lt;p&gt;Build safe AI systems with TypeScript, React, and APIs. Salary $220K - $300K.&lt;/p&gt;&lt;/div&gt;",
      departments: [{ name: "Software Engineering - Infrastructure" }],
    });

    expect(job?.description).toContain("About Anthropic");
    expect(job?.description).toContain("Build safe AI systems");
    expect(job?.description).not.toContain("&lt;");
    expect(job?.description).not.toContain("<div");
  });

  test("maps Seattle-area Greenhouse and Lever board slugs to readable company names", () => {
    const gradial = mapGreenhouseJob("gradial", {
      title: "Product Engineer (UX/UI)",
      absolute_url: "https://job-boards.greenhouse.io/gradial/jobs/4006977009",
      location: { name: "Seattle, WA" },
      content: "Build AI workflow products with TypeScript, React, APIs, and product engineering.",
      departments: [{ name: "Engineering" }],
    });
    const spice = mapLeverPosting("spiceai", {
      text: "Forward Deployed Engineer (Rust)",
      hostedUrl: "https://jobs.lever.co/spiceai/example",
      categories: { team: "Engineering", location: "Seattle, WA", commitment: "Full-time" },
      descriptionPlain: "Deploy AI data products, workflows, APIs, and developer tools with Python and TypeScript.",
      lists: [],
    });

    expect(gradial?.company).toBe("Gradial");
    expect(spice?.company).toBe("Spice AI");
  });

  test("maps SpaceX Greenhouse software postings while keeping specialist filters active", () => {
    const productishSpaceJob = mapGreenhouseJob("spacex", {
      title: "Software Engineer, Starlink Web Platforms",
      absolute_url: "https://boards.greenhouse.io/spacex/jobs/123",
      location: { name: "Redmond, WA" },
      content: "Build TypeScript, React, and API-backed workflow tools for satellite operations and Starlink customers. Salary $180k-$220k.",
      departments: [{ name: "Engineering" }],
    });
    const embeddedSpaceJob = mapGreenhouseJob("spacex", {
      title: "Embedded Software Engineer, Flight Hardware",
      absolute_url: "https://boards.greenhouse.io/spacex/jobs/456",
      location: { name: "Redmond, WA" },
      content: "Develop firmware, device drivers, embedded software, wireless connectivity, and hardware interfaces for spacecraft avionics.",
      departments: [{ name: "Engineering" }],
    });

    expect(productishSpaceJob).toMatchObject({
      company: "SpaceX",
      source: "company_board",
    });
    expect(productishSpaceJob?.fitReasons).toContain("target domain");
    expect(embeddedSpaceJob).toBeUndefined();
  });
});
