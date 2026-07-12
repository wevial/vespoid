import { describe, expect, test } from "bun:test";
import { getInterviewProcessForCompany } from "../src/lib/job-interview-process";

describe("job interview process notes", () => {
  test("returns researched interview process notes for saved companies", () => {
    const anthropic = getInterviewProcessForCompany("Anthropic");

    expect(anthropic?.confidence).toBe("high");
    expect(anthropic?.stages.join(" ").toLowerCase()).toContain("technical");
    expect(anthropic?.sources.some((source) => source.url.includes("anthropic.com/careers"))).toBe(true);
  });

  test("matches company names case-insensitively and trims whitespace", () => {
    expect(getInterviewProcessForCompany("  openai  ")?.company).toBe("OpenAI");
  });

  test("returns undefined for companies without researched interview notes", () => {
    expect(getInterviewProcessForCompany("Unresearched Startup")).toBeUndefined();
  });
});
