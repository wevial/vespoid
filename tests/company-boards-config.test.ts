import { describe, expect, test } from "bun:test";
import { CURATED_COMPANY_BOARDS } from "../scripts/scrape-company-boards";

describe("curated company board list", () => {
  test("includes the requested AI/product companies with working ATS providers", () => {
    expect(CURATED_COMPANY_BOARDS).toEqual(
      expect.arrayContaining([
        { provider: "greenhouse", slug: "anthropic", company: "Anthropic" },
        { provider: "greenhouse", slug: "figma", company: "Figma" },
        { provider: "ashby", slug: "openai", company: "OpenAI" },
        { provider: "ashby", slug: "greptile", company: "Greptile" },
      ]),
    );
  });
});
