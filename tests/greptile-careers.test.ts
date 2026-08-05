import { describe, expect, test } from "bun:test";
import { mapGreptileCareerPage } from "../scripts/scrape-company-boards";

const generalistHtml = `
  <html><head><title>Generalist Engineer - Careers at Greptile</title></head>
  <body>
    <main>
      <a>All Jobs</a>
      <dl>
        <dt>Location</dt><dd>San Francisco</dd>
        <dt>Employment Type</dt><dd>Full time</dd>
        <dt>Location Type</dt><dd>On-site</dd>
        <dt>Department</dt><dd>Engineering</dd>
        <dt>Compensation</dt><dd>$170K – $210K • $40K – $120K Equity • Up to $25K in relocation assistance</dd>
      </dl>
      <h1>Generalist Engineer</h1>
      <p>Build agents that autonomously validate code changes, review pull requests, and catch bugs.</p>
      <p>Frontend, TypeScript, React, and product engineering across the stack.</p>
    </main>
  </body></html>
`;

const frontendHtml = generalistHtml
  .replace("Generalist Engineer - Careers at Greptile", "Frontend Engineer - Careers at Greptile")
  .replace("Generalist Engineer", "Frontend Engineer")
  .replace("$170K – $210K", "$160K – $200K");

describe("Greptile custom careers pages", () => {
  test("maps Greptile generalist and frontend pages into relevant company-board jobs", () => {
    const generalist = mapGreptileCareerPage("https://www.greptile.com/careers/generalist-engineer", generalistHtml);
    const frontend = mapGreptileCareerPage("https://www.greptile.com/careers/frontend-engineer", frontendHtml);

    expect(generalist).toMatchObject({
      source: "company_board",
      company: "Greptile",
      title: "Generalist Engineer",
      url: "https://www.greptile.com/careers/generalist-engineer",
      location: "San Francisco",
      remoteStatus: "onsite",
      salaryRange: "$170K – $210K • $40K – $120K Equity • Up to $25K in relocation assistance",
    });
    expect(generalist?.fitReasons).toContain("generalist engineering role");
    expect(frontend).toMatchObject({
      source: "company_board",
      company: "Greptile",
      title: "Frontend Engineer",
      url: "https://www.greptile.com/careers/frontend-engineer",
      location: "San Francisco",
      remoteStatus: "onsite",
      salaryRange: "$160K – $200K • $40K – $120K Equity • Up to $25K in relocation assistance",
    });
  });
});
