import { describe, expect, test } from "bun:test";
import { extractJobInfo, extractJobInfos } from "../scripts/scrape-hn";
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

  test("keeps US-eligible remote roles even when headquarters are outside target metros", () => {
    const fit = classifyJobFit({
      title: "Full Stack Engineer",
      company: "InfraKit",
      location: "Berlin, Germany",
      remoteStatus: "remote US",
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

    expect(classifyJobFit({
      title: "Senior Fullstack Python Developer",
      company: "Giftster",
      location: "Minneapolis, MN (Greater Twin Cities Metro)",
      remoteStatus: "Remote but local candidates only",
      description: "Python, Django, JavaScript product work.",
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

    const designEngineer = classifyJobFit({
      title: "Design Engineer",
      company: "DesignCo",
      remoteStatus: "Remote US",
      description: "Design systems, marketing pages, and frontend polish with React and TypeScript.",
    });

    expect(designEngineer.isRelevant).toBe(false);
    expect(designEngineer.rejectionReasons).toContain("not target role");

    const intern = classifyJobFit({
      title: "AI Engineer Intern",
      company: "Great Question",
      location: "US / Remote (US)",
      remoteStatus: "remote",
      salaryRange: "$6K - $8K / monthly",
      description: "Internship. Engineering, Full stack. React and AI.",
    });

    expect(intern.isRelevant).toBe(false);
    expect(intern.rejectionReasons).toContain("not target role");
  });

  test("rejects grouped company posts that mix target engineering roles with non-target roles", () => {
    const fit = classifyJobFit({
      title: "Data Engineer, Full Stack Engineers (Sr & Staff/Lead), Sr. Product Manager",
      company: "COVU",
      remoteStatus: "San Francisco (hybrid) or remote (US)",
      description: "AI platform using React, TypeScript, Python, Go, and internal tools.",
    });

    expect(fit.isRelevant).toBe(false);
    expect(fit.rejectionReasons).toContain("grouped mixed-role post");
  });

  test("does not let sibling roles in a split HN comment make non-target individual roles relevant", () => {
    const rustFit = classifyJobFit({
      title: "Senior Rust Engineer",
      company: "Foxglove",
      remoteStatus: "Onsite San Francisco + Remote",
      description: "Many open roles: Senior Frontend Engineer, Product Manager, TypeScript, React, AI platform.",
    });

    expect(rustFit.isRelevant).toBe(false);
    expect(rustFit.rejectionReasons).toContain("not target role");

    const frontendFit = classifyJobFit({
      title: "Senior Frontend Engineer (Visualization, WebGL, WASM)",
      company: "Foxglove",
      remoteStatus: "Onsite San Francisco + Remote",
      description: "TypeScript, React, AI platform work.",
    });

    expect(frontendFit.isRelevant).toBe(true);
  });

  test("rejects generic multi-role company posts until roles are split into individual listings", () => {
    const fit = classifyJobFit({
      title: "Multiple Roles",
      company: "Instinct Science",
      remoteStatus: "Remote US",
      description: "Hiring frontend engineers, product managers, and designers for a TypeScript React AI platform.",
    });

    expect(fit.isRelevant).toBe(false);
    expect(fit.rejectionReasons).toContain("grouped company post");
  });

  test("rejects remote roles restricted to EU or Canada because US work eligibility is not assumed", () => {
    const euOnly = classifyJobFit({
      title: "Senior Full Stack Engineer",
      company: "EuroDevTools",
      remoteStatus: "Remote EU only",
      description: "Build AI developer tools with TypeScript and React. Remote Europe only.",
    });

    expect(euOnly.isRelevant).toBe(false);
    expect(euOnly.rejectionReasons).toContain("outside work authorization");

    const emeaApac = classifyJobFit({
      title: "Senior Python Backend Engineer",
      company: "RegionLocked",
      remoteStatus: "Remote EMEA/APAC",
      description: "AI platform work with Python and React.",
    });

    expect(emeaApac.isRelevant).toBe(false);
    expect(emeaApac.rejectionReasons).toContain("outside work authorization");

    const europeTimezone = classifyJobFit({
      title: "Senior Backend Engineer",
      company: "EuroTimezone",
      remoteStatus: "Hybrid London, Paris, Montpellier or remote UTC-1 to UTC+2",
      description: "Developer tools with TypeScript, React, and Python.",
    });

    expect(europeTimezone.isRelevant).toBe(false);
    expect(europeTimezone.rejectionReasons).toContain("outside work authorization");

    const cestTimezone = classifyJobFit({
      title: "Flutter mobile engineer, Software Engineer",
      company: "CETCo",
      remoteStatus: "Remote within 2/3 hrs timezone of CEST",
      description: "Product engineering with React Native, TypeScript, and AI features.",
    });

    expect(cestTimezone.isRelevant).toBe(false);
    expect(cestTimezone.rejectionReasons).toContain("outside work authorization");

    const canadaOnly = classifyJobFit({
      title: "Product Engineer",
      company: "NorthStack",
      remoteStatus: "Remote Canada only",
      description: "React, TypeScript, and Python product work.",
    });

    expect(canadaOnly.isRelevant).toBe(false);
    expect(canadaOnly.rejectionReasons).toContain("outside work authorization");
  });

  test("keeps remote roles that explicitly include the US even if they also include other regions", () => {
    const fit = classifyJobFit({
      title: "Staff Software Engineer, AI",
      company: "GlobalHealth",
      remoteStatus: "Remote US / Canada / Europe",
      description: "AI product engineering with TypeScript, React, and Python. $190k-$220k.",
    });

    expect(fit.isRelevant).toBe(true);
    expect(fit.rejectionReasons).not.toContain("outside work authorization");
  });

  test("treats Spain-only roles as possible but uncertain instead of standard EU eligible", () => {
    const fit = classifyJobFit({
      title: "Senior Product Engineer",
      company: "Madrid AI Tools",
      location: "Madrid, Spain",
      remoteStatus: "Hybrid Spain",
      description: "TypeScript, React, Python, and AI product work.",
    });

    expect(fit.isRelevant).toBe(true);
    expect(fit.reasons).toContain("possible Spain eligibility");
  });

  test("applies compensation floors by location while allowing missing salary", () => {
    expect(classifyJobFit({
      title: "Senior Frontend Engineer",
      company: "Bay Tools",
      location: "San Francisco",
      remoteStatus: "hybrid",
      salaryRange: "$140k - $165k",
      description: "React, TypeScript, and AI developer tools.",
    }).isRelevant).toBe(false);

    expect(classifyJobFit({
      title: "Senior Full Stack Engineer",
      company: "Denver Tools",
      location: "Denver, CO",
      remoteStatus: "hybrid",
      salaryRange: "$150k - $165k",
      description: "React, TypeScript, Go, and developer tools.",
    }).isRelevant).toBe(true);

    expect(classifyJobFit({
      title: "Senior Product Engineer",
      company: "Remote AI",
      remoteStatus: "Remote US",
      description: "React, TypeScript, Python, and AI product work. Compensation not listed.",
    }).isRelevant).toBe(true);
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

  test("splits HN company comments with explicit role lists into individual target role listings", () => {
    const infos = extractJobInfos(
      "Foxglove | Onsite (San Francisco) + Remote | Full Time | https://foxglove.dev/",
      `Foxglove | Onsite (San Francisco) + Remote | Full Time | https://foxglove.dev/<p>
        Foxglove is the leading observability platform for robotics and physical AI.
        Many open roles:<p>
        - Senior Rust Engineer<br>
        - Senior Frontend Engineer (Visualization, WebGL, WASM)<br>
        - Solutions Engineer, Data Infrastructure<br>
        - Product Manager, Data + ML<br>
        - Account Executive<br>
        Email jobs@example.com
      `,
      "foxglove",
    );

    expect(infos.map((info) => info.title)).toEqual([
      "Senior Rust Engineer",
      "Senior Frontend Engineer (Visualization, WebGL, WASM)",
      "Solutions Engineer, Data Infrastructure",
    ]);
    expect(infos.every((info) => info.company === "Foxglove")).toBe(true);
    expect(infos.every((info) => info.remoteStatus === "onsite (san francisco) + remote")).toBe(true);
    expect(infos.every((info) => !info.description.includes("Product Manager"))).toBe(true);
  });
});
