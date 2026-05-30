import { describe, expect, test } from "bun:test";
import { extractJobInfo } from "../scripts/scrape-hn";
import { classifyJobFit, extractSalaryRange, isTargetLocation } from "../src/lib/job-fit";

describe("target job fit", () => {
  test("keeps strong remote product/full-stack roles with target stack and high salary", () => {
    const fit = classifyJobFit({
      title: "Senior Product Engineer",
      company: "Acme AI Devtools",
      location: "Remote",
      remoteStatus: "remote",
      salaryRange: "$190k - $230k",
      description: "Build AI developer tools with TypeScript, React, Next.js, Go, and Python. 0 to 1 product work.",
    });

    expect(fit.isRelevant).toBe(true);
    expect(fit.score).toBeGreaterThanOrEqual(9);
    expect(fit.reasons).toContain("target role");
    expect(fit.reasons).toContain("target location");
    expect(fit.reasons).toContain("target domain");
    expect(fit.reasons).toContain("salary target");
  });

  test("keeps hybrid/in-office roles only in target metro areas", () => {
    expect(isTargetLocation("San Francisco, CA", "onsite")).toBe(true);
    expect(isTargetLocation("Seattle", "hybrid")).toBe(true);
    expect(isTargetLocation("Boulder, CO", "hybrid")).toBe(true);
    expect(isTargetLocation("New York, NY", "hybrid")).toBe(false);
    expect(isTargetLocation("Berlin, Germany", "onsite")).toBe(false);
  });

  test("keeps remote roles even when headquarters are outside target metros", () => {
    const fit = classifyJobFit({
      title: "Full Stack Engineer",
      company: "InfraKit",
      location: "Berlin, Germany",
      remoteStatus: "remote",
      description: "Remote team building dev tools in React and Go.",
    });

    expect(fit.isRelevant).toBe(true);
    expect(fit.reasons).toContain("target location");
  });

  test("rejects non-job comments and freelancer ads", () => {
    expect(classifyJobFit({
      title: "Not hiring, but actively helping healthcare AI startups navigate compliance challenges.",
      company: "francosimon",
      description: "Not hiring, but actively helping healthcare AI startups navigate compliance challenges.",
    }).isRelevant).toBe(false);

    expect(classifyJobFit({
      title: "Tiger Tracks",
      company: "SEEKING FREELANCER",
      remoteStatus: "remote, us/eu timezones",
      description: "SEEKING FREELANCER | Contract-to-hire | remote",
    }).isRelevant).toBe(false);
  });

  test("rejects non-target locations when not remote", () => {
    const fit = classifyJobFit({
      title: "Frontend Engineer",
      company: "GoodStack",
      location: "NYC",
      remoteStatus: "onsite",
      description: "React and TypeScript product engineering.",
    });

    expect(fit.isRelevant).toBe(false);
    expect(fit.rejectionReasons).toContain("outside target locations");
  });

  test("does not let incidental remote mentions override explicit non-target onsite, hybrid, or local-only roles", () => {
    expect(classifyJobFit({
      title: "Full Stack Engineer",
      company: "Kepler",
      location: "New York, NY",
      remoteStatus: "onsite",
      description: "React, TypeScript, AI workflows, and remote device control infrastructure.",
    }).isRelevant).toBe(false);

    expect(classifyJobFit({
      title: "Senior Software Engineer",
      company: "Oaktree Capital",
      location: "Los Angeles, CA",
      remoteStatus: "hybrid",
      description: "Python, React, AI platform work with remote collaborators.",
    }).isRelevant).toBe(false);

    expect(classifyJobFit({
      title: "Senior Fullstack Python Developer",
      company: "Giftster",
      location: "Minneapolis, MN",
      description: "Work is remote, but applicants must be local to the Twin Cities metro area. Python, Django, JavaScript product work.",
    }).isRelevant).toBe(false);
  });

  test("rejects roles that are clearly outside product/full-stack engineering", () => {
    const fit = classifyJobFit({
      title: "Growth Marketer",
      company: "MediaCo",
      location: "Remote",
      remoteStatus: "remote",
      description: "Remote growth marketing role at a product studio.",
    });

    expect(fit.isRelevant).toBe(false);
    expect(fit.rejectionReasons).toContain("not target role");
  });

  test("parses compact salary ranges", () => {
    expect(extractSalaryRange("Full-time | $180-220K + equity")?.max).toBe(220000);
    expect(extractSalaryRange("Compensation: $160,000 - $190,000")?.max).toBe(190000);
    expect(extractSalaryRange("Salary £120k")?.max).toBeUndefined();
  });
});

describe("HN listing extraction", () => {
  test("does not overwrite a real location with employment type segments", () => {
    const info = extractJobInfo(
      "Y Combinator | Product Engineers on YC's own team | San Francisco | Full Time | $180K - $250K",
      "Y Combinator | Product Engineers on YC's own team | San Francisco | Full Time | $180K - $250K<p>Build software for founders with React and TypeScript.</p>",
      "yc_throwaway",
    );

    expect(info.title).toBe("Product Engineers on YC's own team");
    expect(info.location).toBe("San Francisco");
    expect(info.salaryRange).toBe("$180K - $250K");
  });

  test("skips URL and remote segments to choose the first role-like title", () => {
    const info = extractJobInfo(
      "SerpApi | https://serpapi.com | Junior to Senior Fullstack Engineer multiple positions | Austin, TX | ONSITE or FULLY REMOTE | $150K - 180K",
      "SerpApi | https://serpapi.com | Junior to Senior Fullstack Engineer multiple positions | Austin, TX | ONSITE or FULLY REMOTE | $150K - 180K<p>Search API company using React.</p>",
      "serpapi",
    );

    expect(info.title).toBe("Junior to Senior Fullstack Engineer multiple positions");
    expect(info.location).toBe("Austin, TX");
    expect(info.remoteStatus).toBe("onsite or fully remote");
  });
});
