import { describe, expect, test } from "bun:test";
import { mapBuiltinJobCard, parseBuiltinJobsFromHtml } from "../src/lib/city-board-jobs";

describe("city-specific board mapping", () => {
  test("maps a Built In Seattle target job card as city_board", () => {
    const job = mapBuiltinJobCard(
      {
        title: "Senior Full Stack Engineer",
        company: "Read AI",
        location: "Seattle, WA",
        url: "/job/senior-full-stack-engineer/12345",
        description: "Build AI collaboration products with React, TypeScript, Python APIs. $180K - $220K.",
      },
      "seattle",
    );

    expect(job).toMatchObject({
      source: "city_board",
      title: "Senior Full Stack Engineer",
      company: "Read AI",
      location: "Seattle, WA",
      remoteStatus: undefined,
    });
    expect(job?.url).toBe("https://builtin.com/job/senior-full-stack-engineer/12345");
    expect(job?.fitReasons).toContain("Seattle/WA preference");
  });

  test("filters city-board jobs outside the target role", () => {
    const job = mapBuiltinJobCard(
      {
        title: "Customer Success Manager",
        company: "ExampleCo",
        location: "Seattle, WA",
        url: "https://builtin.com/job/customer-success/1",
        description: "Own customer success renewals.",
      },
      "seattle",
    );

    expect(job).toBeUndefined();
  });

  test("parses Next data job cards from Built In pages", () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          jobs: [
            {
              title: "Frontend Engineer",
              company: { name: "Figma" },
              location: "San Francisco, CA",
              url: "/job/frontend-engineer/777",
              description: "React and TypeScript developer tools. $180K - $220K.",
            },
          ],
        },
      },
    })}</script>`;

    const jobs = parseBuiltinJobsFromHtml(html, "san-francisco");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ source: "city_board", company: "Figma" });
  });
});
