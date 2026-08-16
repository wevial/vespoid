import { describe, expect, test } from "bun:test";
import { buildHermesCodexCommand } from "../scripts/lib/hermes-codex";
import { parseJsonPayload } from "../scripts/curate-hn-llm";

describe("Hermes Codex OAuth curation runner", () => {
  test("uses GPT-5.6 Luna with max reasoning and the Hermes OAuth runtime", () => {
    expect(
      buildHermesCodexCommand({
        bridgePath: "/app/scripts/hermes-codex-oauth.py",
        pythonPath: "/opt/hermes-python",
        model: "gpt-5.6-luna",
        reasoning: "max",
      }),
    ).toEqual([
      "/opt/hermes-python",
      "/app/scripts/hermes-codex-oauth.py",
      "--model",
      "gpt-5.6-luna",
      "--reasoning",
      "max",
    ]);
  });

  test("extracts one JSON payload surrounded by model status text", () => {
    expect(parseJsonPayload('⚠ Model status\n[{"sourceCommentId":"123","title":"Product Engineer"}]\nDone')).toEqual([
      { sourceCommentId: "123", title: "Product Engineer" },
    ]);
  });

  test("ignores incidental empty arrays before the curation payload", () => {
    expect(
      parseJsonPayload('⚠ retries[] exhausted\n[{"sourceCommentId":"123","title":"Product Engineer"}]'),
    ).toEqual([{ sourceCommentId: "123", title: "Product Engineer" }]);
  });

  test("fails closed when model output contains no JSON payload", () => {
    expect(() => parseJsonPayload("⚠ Model could not produce structured output")).toThrow();
  });
});
