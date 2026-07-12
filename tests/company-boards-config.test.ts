import { describe, expect, test } from "bun:test";
import { CURATED_COMPANY_BOARDS, extractNousResearchRoleLinks, mapNousResearchRolePage, mapPostHogCareerPage, mapWorkableMarkdownJob } from "../scripts/scrape-company-boards";

describe("curated company board list", () => {
  test("includes the requested AI/product companies with working ATS providers", () => {
    expect(CURATED_COMPANY_BOARDS).toEqual(
      expect.arrayContaining([
        { provider: "greenhouse", slug: "anthropic", company: "Anthropic" },
        { provider: "greenhouse", slug: "figma", company: "Figma" },
        { provider: "greenhouse", slug: "spacex", company: "SpaceX" },
        { provider: "ashby", slug: "openai", company: "OpenAI" },
        { provider: "ashby", slug: "cohere", company: "Cohere" },
        { provider: "workable", slug: "huggingface", company: "Hugging Face" },
        { provider: "lever", slug: "mistral", company: "Mistral" },
        { provider: "greenhouse", slug: "togetherai", company: "Together AI" },
        { provider: "greenhouse", slug: "xai", company: "xAI" },
        { provider: "ashby", slug: "cognition", company: "Cognition" },
        { provider: "ashby", slug: "macroscope", company: "Macroscope" },
        { provider: "ashby", slug: "read-ai", company: "Read AI" },
        { provider: "ashby", slug: "statsig", company: "Statsig" },
        { provider: "ashby", slug: "motherduck", company: "MotherDuck" },
        { provider: "ashby", slug: "temporal", company: "Temporal" },
        { provider: "ashby", slug: "typesafe-ai", company: "TypeSafe AI" },
        { provider: "lever", slug: "spiceai" },
        { provider: "greenhouse", slug: "gradial" },
        { provider: "greenhouse", slug: "pulumicorporation" },
        { provider: "greenhouse", slug: "seekout" },
        { provider: "lever", slug: "highspot" },
        { provider: "greenhouse", slug: "echodynecorp" },
        { provider: "ashby", slug: "humanly", company: "Humanly" },
        { provider: "greenhouse", slug: "leveltenenergy" },
        { provider: "greenhouse", slug: "truveta" },
        { provider: "greenhouse", slug: "phaidra" },
        { provider: "ashby", slug: "greptile", company: "Greptile" },
      ]),
    );
    expect(CURATED_COMPANY_BOARDS).not.toContainEqual({ provider: "ashby", slug: "nous", company: "Nous Research" });
  });

  test("parses PostHog's custom careers page as a company-board source", () => {
    const mapped = mapPostHogCareerPage(
      "https://posthog.com/careers/product-engineer",
      `<html><head><title>Product Engineer - PostHog</title></head><body>
        <h1>Product Engineer</h1>
        <dl><dt>Location</dt><dd>Remote</dd></dl>
        <p>Build product analytics, feature flags, experiments, devtools, TypeScript, React, Python, and AI agents.</p>
        <p>Compensation $170,000 - $220,000</p>
      </body></html>`,
    );

    expect(mapped).toMatchObject({
      company: "PostHog",
      title: "Product Engineer",
      url: "https://posthog.com/careers/product-engineer",
      source: "company_board",
      location: "Remote",
      remoteStatus: "remote",
    });
    expect(mapped?.fitReasons).toContain("target role");
  });

  test("parses Workable jobs.md rows as company-board roles", () => {
    const mapped = mapWorkableMarkdownJob(
      "Hugging Face",
      [
        "Senior Python Software Engineer/Open-Source Contributor - US Remote",
        "Product",
        "United States (Remote)",
        "Full-time",
        "—",
        "2026-06-02",
        "[View](https://apply.workable.com/huggingface/jobs/view/F8427A442D.md)",
      ],
      "**Workplace:** remote\n\nBuild Gradio, Trackio, Python frameworks, React frontends, and AI developer tools.",
    );

    expect(mapped).toMatchObject({
      company: "Hugging Face",
      title: "Senior Python Software Engineer/Open-Source Contributor - US Remote",
      url: "https://apply.workable.com/huggingface/jobs/view/F8427A442D",
      source: "company_board",
      location: "United States (Remote)",
      remoteStatus: "remote",
    });
    expect(mapped?.fitReasons).toContain("target stack");
  });

  test("parses Nous Research's own fully remote careers page instead of the unrelated Ashby nous board", () => {
    const careersHtml = `
      <p>Our team is <span>fully remote</span>, high-agency, and mission focused.</p>
      <a href="https://nousresearch.com/full-stack-engineer/">FULL TIME\nFull Stack Engineer\nHelp build Nous Products, end to end.</a>
      <a href="https://nousresearch.com/forward-deployed-engineer/">FULL TIME\nForward Deployed Engineer\nDeploy and adapt Hermes Agent Enterprise inside customer environments.</a>
    `;

    expect(extractNousResearchRoleLinks(careersHtml)).toEqual([
      "https://nousresearch.com/full-stack-engineer/",
      "https://nousresearch.com/forward-deployed-engineer/",
    ]);

    const mapped = mapNousResearchRolePage(
      "https://nousresearch.com/forward-deployed-engineer/",
      "<h1>Forward Deployed Engineer</h1><p>Deploy Hermes Agent Enterprise with TypeScript, React, Python, APIs, workflows, and AI agents.</p>",
      careersHtml,
    );

    expect(mapped).toMatchObject({
      company: "Nous Research",
      title: "Forward Deployed Engineer",
      location: "Remote",
      remoteStatus: "remote",
    });
    expect(mapped?.fitReasons).toContain("target role");
  });
});
