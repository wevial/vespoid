import { describe, expect, test } from "bun:test";
import { buildHermesCodexCommand } from "../scripts/lib/hermes-codex";

describe("Hermes Codex OAuth curation runner", () => {
  test("uses GPT-5.6 Sol with low reasoning and the Hermes OAuth runtime", () => {
    expect(
      buildHermesCodexCommand({
        bridgePath: "/app/scripts/hermes-codex-oauth.py",
        pythonPath: "/opt/hermes-python",
        model: "gpt-5.6-sol",
        reasoning: "low",
      }),
    ).toEqual([
      "/opt/hermes-python",
      "/app/scripts/hermes-codex-oauth.py",
      "--model",
      "gpt-5.6-sol",
      "--reasoning",
      "low",
    ]);
  });
});
