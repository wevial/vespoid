import { describe, expect, test } from "bun:test";
import {
  buildHiringPostCurationPrompt,
  normalizeCuratedJobsForPost,
  type HNRawHiringPost,
} from "../src/lib/llm-curation";

const rawPost: HNRawHiringPost = {
  id: 123,
  author: "foxposter",
  createdAt: "2026-05-01T00:00:00.000Z",
  firstLine: "Foxglove | Onsite (San Francisco) + Remote | Full Time | https://foxglove.dev/",
  text: `Foxglove | Onsite (San Francisco) + Remote | Full Time | https://foxglove.dev/
Foxglove is the leading data infrastructure platform for robotics & physical AI.
Many open roles:
- Senior Rust Engineer
- Senior Frontend Engineer (Visualization, WebGL, WASM)
- Product Manager, Data + ML
- Account Executive
https://foxglove.dev/careers`,
};

describe("LLM hiring-post curation safety", () => {
  test("normalizes relevant LLM drafts into ingestable HN jobs", () => {
    const jobs = normalizeCuratedJobsForPost(rawPost, [
      {
        sourceCommentId: "123",
        company: "Foxglove",
        title: "Senior Frontend Engineer (Visualization, WebGL, WASM)",
        description: "Build TypeScript/React/WebGL visualization tools for robotics and physical AI.",
        url: "https://foxglove.dev/careers",
        location: "San Francisco or remote US",
        remoteStatus: "onsite San Francisco + remote",
        salaryRange: null,
        fitReasons: ["frontend", "React", "AI/robotics infrastructure"],
        confidence: 0.9,
      },
    ]);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: "hn",
      company: "Foxglove",
      title: "Senior Frontend Engineer (Visualization, WebGL, WASM)",
      url: "https://foxglove.dev/careers#hn-123-senior-frontend-engineer-visualization-webgl-was",
      postedAt: rawPost.createdAt,
    });
    expect(jobs[0].fitScore).toBeGreaterThanOrEqual(7);
  });

  test("rejects non-target roles, hallucinated URLs, and wrong-source drafts", () => {
    const jobs = normalizeCuratedJobsForPost(rawPost, [
      {
        sourceCommentId: "123",
        company: "Foxglove",
        title: "Product Manager, Data + ML",
        description: "PM role for data products.",
        url: "https://foxglove.dev/careers",
        location: "Remote US",
        remoteStatus: "remote",
        salaryRange: null,
        fitReasons: ["product"],
        confidence: 0.9,
      },
      {
        sourceCommentId: "123",
        company: "Foxglove",
        title: "Senior Frontend Engineer",
        description: "React and TypeScript.",
        url: "https://evil.example/apply",
        location: "Remote US",
        remoteStatus: "remote",
        salaryRange: null,
        fitReasons: ["frontend"],
        confidence: 0.9,
      },
      {
        sourceCommentId: "999",
        company: "Foxglove",
        title: "Senior Frontend Engineer",
        description: "React and TypeScript.",
        url: "https://foxglove.dev/careers",
        location: "Remote US",
        remoteStatus: "remote",
        salaryRange: null,
        fitReasons: ["frontend"],
        confidence: 0.9,
      },
    ]);

    expect(jobs).toHaveLength(0);
  });

  test("builds a strict JSON curation prompt with Ko's target profile and no-invention rules", () => {
    const prompt = buildHiringPostCurationPrompt([rawPost]);

    expect(prompt).toContain("Return strict JSON only");
    expect(prompt).toContain("Product Engineer / Full-stack / Frontend-leaning Software Engineer");
    expect(prompt).toContain("Do not invent");
    expect(prompt).toContain("reject Product Manager");
    expect(prompt).toContain("sourceCommentId");
    expect(prompt).toContain("Foxglove");
  });
});
