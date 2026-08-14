import { homedir } from "node:os";
import { join } from "node:path";

export type HermesReasoning = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";

export type HermesCodexCommandOptions = {
  bridgePath: string;
  pythonPath: string;
  model: string;
  reasoning: HermesReasoning;
};

export function buildHermesCodexCommand(options: HermesCodexCommandOptions): string[] {
  return [
    options.pythonPath,
    options.bridgePath,
    "--model",
    options.model,
    "--reasoning",
    options.reasoning,
  ];
}

export async function runHermesCodexPrompt(
  prompt: string,
  options: Partial<HermesCodexCommandOptions> = {},
): Promise<string> {
  const agentDir = process.env.HERMES_AGENT_DIR ?? join(homedir(), ".hermes", "hermes-agent");
  const resolved: HermesCodexCommandOptions = {
    bridgePath: options.bridgePath ?? process.env.VESPOID_HERMES_BRIDGE ?? join(import.meta.dir, "..", "hermes-codex-oauth.py"),
    pythonPath: options.pythonPath ?? process.env.HERMES_PYTHON ?? join(agentDir, "venv", "bin", "python"),
    model: options.model ?? process.env.VESPOID_LLM_MODEL ?? "gpt-5.6-luna",
    reasoning: options.reasoning ?? (process.env.VESPOID_LLM_REASONING as HermesReasoning | undefined) ?? "max",
  };

  const processHandle = Bun.spawn({
    cmd: buildHermesCodexCommand(resolved),
    cwd: agentDir,
    env: { ...process.env, HERMES_AGENT_DIR: agentDir },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  processHandle.stdin.write(prompt);
  processHandle.stdin.end();

  const [exitCode, stdout, stderr] = await Promise.all([
    processHandle.exited,
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(`Hermes OpenAI-Codex inference failed (${exitCode}): ${stderr.trim() || "no error output"}`);
  }

  const response = stdout.trim();
  if (!response) {
    throw new Error("Hermes OpenAI-Codex inference returned an empty response");
  }
  return response;
}
