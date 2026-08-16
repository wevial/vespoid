import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildHermesCodexCommand } from "../scripts/lib/hermes-codex";
import { parseJsonPayload } from "../scripts/curate-hn-llm";

async function runFakeHermesBridge(result: Record<string, unknown>) {
  const agentDir = await mkdtemp(join(tmpdir(), "vespoid-hermes-bridge-"));
  try {
    await mkdir(join(agentDir, "hermes_cli"));
    await writeFile(join(agentDir, "hermes_cli", "__init__.py"), "");
    await writeFile(
      join(agentDir, "hermes_cli", "runtime_provider.py"),
      'def resolve_runtime_provider(**kwargs):\n    return {"base_url":"test","api_key":"test","provider":"test","api_mode":"test"}\n',
    );
    await writeFile(
      join(agentDir, "run_agent.py"),
      `import json\n\nclass AIAgent:\n    def __init__(self, **kwargs):\n        pass\n    def run_conversation(self, prompt):\n        print("⚠ provider diagnostic")\n        return json.loads(${JSON.stringify(JSON.stringify(result))})\n`,
    );

    const processHandle = Bun.spawn({
      cmd: ["python3", join(process.cwd(), "scripts", "hermes-codex-oauth.py")],
      env: { ...process.env, HERMES_AGENT_DIR: agentDir },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    processHandle.stdin.write("test prompt");
    processHandle.stdin.end();
    const [exitCode, stdout, stderr] = await Promise.all([
      processHandle.exited,
      new Response(processHandle.stdout).text(),
      new Response(processHandle.stderr).text(),
    ]);
    return { exitCode, stdout, stderr };
  } finally {
    await rm(agentDir, { recursive: true, force: true });
  }
}

describe("Hermes Codex OAuth curation runner", () => {
  test("uses GPT-5.6 Luna with high reasoning and the Hermes OAuth runtime", () => {
    expect(
      buildHermesCodexCommand({
        bridgePath: "/app/scripts/hermes-codex-oauth.py",
        pythonPath: "/opt/hermes-python",
        model: "gpt-5.6-luna",
        reasoning: "high",
      }),
    ).toEqual([
      "/opt/hermes-python",
      "/app/scripts/hermes-codex-oauth.py",
      "--model",
      "gpt-5.6-luna",
      "--reasoning",
      "high",
    ]);
  });

  test("keeps provider diagnostics out of successful JSON stdout", async () => {
    const result = await runFakeHermesBridge({
      final_response: '[{"sourceCommentId":"123"}]',
      completed: true,
      failed: false,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('[{"sourceCommentId":"123"}]');
    expect(result.stderr).toContain("⚠ provider diagnostic");
  });

  test("returns a failing bridge exit when Hermes reports provider failure", async () => {
    const result = await runFakeHermesBridge({
      final_response: "API call failed after 3 retries: Broken pipe",
      completed: false,
      failed: true,
      error: "Broken pipe",
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Hermes provider inference failed: Broken pipe");
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
