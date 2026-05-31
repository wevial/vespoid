import { describe, expect, test } from "bun:test";
import { mapYcJobPosting, parseYcJobsFromHtml } from "../src/lib/yc-jobs";

const samplePosting = {
  id: 44310,
  title: "Full Stack Product Engineer - Remote/US",
  url: "/companies/jiga/jobs/KMtdgpo-full-stack-product-engineer-remote-us",
  location: "US / Remote (US)",
  type: "Full-time",
  prettyRole: "Engineering",
  roleSpecificType: "Full stack",
  salaryRange: "$120K - $190K",
  equityRange: "0.05% - 0.10%",
  minExperience: "6+ years",
  visa: "US citizen/visa only",
  skills: ["MongoDB", "Node.js", "React"],
  companyName: "Jiga",
  companyBatchName: "W21",
  companyOneLiner: "Source better parts by partnering directly with vetted manufacturers",
  createdAt: "3 days",
};

function htmlWithPostings(postings: unknown[]) {
  const dataPage = JSON.stringify({ component: "WaasLandingPage", props: { jobPostings: postings } })
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
  return `<html><body><div data-page="${dataPage}"></div></body></html>`;
}

describe("YC jobs parser", () => {
  test("maps YC job postings into Vespoid listings", () => {
    const job = mapYcJobPosting(samplePosting);

    expect(job).toBeDefined();
    expect(job!).toMatchObject({
      url: "https://www.ycombinator.com/companies/jiga/jobs/KMtdgpo-full-stack-product-engineer-remote-us",
      title: "Full Stack Product Engineer - Remote/US",
      company: "Jiga",
      source: "yc",
      salaryRange: "$120K - $190K",
      location: "US / Remote (US)",
      remoteStatus: "remote",
    });
    expect(job!.description).toContain("YC W21");
    expect(job!.description).toContain("Skills: MongoDB, Node.js, React");
  });

  test("extracts jobs from the YC data-page payload", () => {
    const jobs = parseYcJobsFromHtml(htmlWithPostings([samplePosting]));

    expect(jobs).toHaveLength(1);
    expect(jobs[0].company).toBe("Jiga");
    expect(jobs[0].fitScore).toBeGreaterThanOrEqual(7);
  });

  test("rejects incomplete postings before ingestion", () => {
    const jobs = parseYcJobsFromHtml(htmlWithPostings([{ ...samplePosting, title: "" }]));

    expect(jobs).toHaveLength(0);
  });
});
