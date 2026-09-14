import { describe, expect, test } from "bun:test";
import {
  CURATED_COMPANY_BOARDS,
  extractFactoryRoleLinks,
  extractNousResearchRoleLinks,
  extractPlaidRoleLinks,
  mapFactoryCareerPage,
  mapGitHubCareerJob,
  mapPlaidCareerPage,
  mapNousResearchRolePage,
  mapPostHogCareerPage,
  mapWorkableMarkdownJob,
} from "../scripts/scrape-company-boards";

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
        { provider: "ashby", slug: "serval", company: "Serval" },
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
        { provider: "ashby", slug: "coderabbit", company: "CodeRabbit" },
        { provider: "ashby", slug: "socket", company: "Socket" },
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

  test("maps a US GitHub careers API job into the company-board feed", () => {
    const mapped = mapGitHubCareerJob({
      data: {
        slug: "5642",
        title: "Senior Software Engineer, Copilot Experience",
        country: "United States",
        country_code: "US",
        location_name: "US Remote",
        description: "<p>Build user-facing AI developer tools with React and TypeScript.</p>",
        qualifications: "<p>5+ years of software engineering experience.</p>",
        responsibilities: "<p>Ship frontend product experiences.</p>",
        posted_date: "2026-08-03T14:02:00+0000",
      },
    });

    expect(mapped).toMatchObject({
      company: "GitHub",
      title: "Senior Software Engineer, Copilot Experience",
      url: "https://www.github.careers/careers-home/jobs/5642?lang=en-us",
      source: "company_board",
      location: "US Remote",
      remoteStatus: "remote",
      postedAt: "2026-08-03T14:02:00+0000",
    });
    expect(mapped?.description).toContain("React and TypeScript");
    expect(mapped?.fitReasons).toContain("target role");
  });

  test("rejects GitHub careers API jobs outside the US even when marked remote", () => {
    expect(mapGitHubCareerJob({
      data: {
        slug: "5636",
        title: "Senior Software Engineer, Copilot Experience",
        country: "India",
        country_code: "IN",
        location_name: "Remote",
        description: "<p>Build user-facing AI developer tools with React and TypeScript.</p>",
      },
    })).toBeUndefined();
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

  test("discovers and maps Factory's direct careers roles as a company-board source", () => {
    const careersHtml = `
      <a href="/careers/software-engineer-frontend">Software Engineer, Frontend</a>
      <a href="/careers/software-engineer-platform">Software Engineer, Platform</a>
    `;
    expect(extractFactoryRoleLinks(careersHtml)).toEqual([
      "https://factory.ai/careers/software-engineer-frontend",
      "https://factory.ai/careers/software-engineer-platform",
    ]);

    const mapped = mapFactoryCareerPage(
      "https://factory.ai/careers/software-engineer-frontend",
      `<html><head><title>Software Engineer, Frontend | Factory</title></head><body>
        <h1>Software Engineer, Frontend</h1>
        <p>San Francisco, CA · Full time</p>
        <p>Factory raised a $150M Series C. Build AI software engineering products with TypeScript, React, and developer tools.</p>
      </body></html>`,
    );
    expect(mapped).toMatchObject({
      company: "Factory",
      title: "Software Engineer, Frontend",
      source: "company_board",
      location: "San Francisco, CA",
      remoteStatus: "onsite",
    });
    expect(mapped?.fitReasons).toContain("target role");
  });

  test("discovers and maps Plaid's direct careers roles as a company-board source", () => {
    const careersHtml = `
      <a href="/careers/openings/engineering/seattle-office/senior-software-engineer-full-stack/">Senior Software Engineer, Full Stack</a>
      <a href="/careers/openings/product/senior-product-manager/">Senior Product Manager</a>
    `;
    expect(extractPlaidRoleLinks(careersHtml)).toEqual([
      "https://plaid.com/careers/openings/engineering/seattle-office/senior-software-engineer-full-stack/",
      "https://plaid.com/careers/openings/product/senior-product-manager/",
    ]);

    const mapped = mapPlaidCareerPage(
      "https://plaid.com/careers/openings/engineering/seattle-office/senior-software-engineer-full-stack/",
      `<html><head><title>Senior Software Engineer, Full Stack | Seattle Office | Plaid</title></head><body>
        <h1>Senior Software Engineer, Full Stack</h1><p>Seattle Office</p>
        <p>Build product-facing financial APIs, TypeScript and React developer tools. $180,000 - $220,000</p>
      </body></html>`,
    );
    expect(mapped).toMatchObject({
      company: "Plaid",
      title: "Senior Software Engineer, Full Stack",
      source: "company_board",
      location: "Seattle Office",
    });
    expect(mapped?.fitReasons).toContain("Seattle/WA preference");
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

  test("discovers Nous Research roles when the full-time badge touches the title text", () => {
    const careersHtml = `
      <a class="role-link" href="/full-stack-engineer/" target="_blank">
        <div class="role-title"><span class="badge full-time">Full Time</span>Full Stack Engineer</div>
        <div class="role-description">Help build Nous Products, end to end.</div>
      </a>
    `;

    expect(extractNousResearchRoleLinks(careersHtml)).toEqual([
      "https://nousresearch.com/full-stack-engineer/",
    ]);
  });
});
