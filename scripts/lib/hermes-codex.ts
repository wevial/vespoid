import { existsSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";

export type HermesReasoning = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";

export type HermesCodexCommandOptions = {
  bridgePath: string;
  pythonPath: string;
  model: string;
  reasoning: HermesReasoning;
};

type HermesAgentDirResolutionOptions = {
  configured?: string;
  profileHome?: string;
  accountHome?: string;
  pathEntries?: string[];
  exists?: (path: string) => boolean;
};

function isHermesRuntimeDir(candidate: string, exists: (path: string) => boolean): boolean {
  return ["venv/bin/python", "run_agent.py", "hermes_cli/runtime_provider.py"].every((path) => exists(join(candidate, path)));
}

export function resolveHermesAgentDir({
  configured = process.env.HERMES_AGENT_DIR,
  profileHome = homedir(),
  accountHome = userInfo().homedir,
  pathEntries = (process.env.PATH ?? "").split(":").filter(Boolean),
  exists = existsSync,
}: HermesAgentDirResolutionOptions = {}): string {
  const pathRuntimeDirs = pathEntries
    .filter((entry) => entry.endsWith("/venv/bin"))
    .map((entry) => dirname(dirname(entry)));
  const candidates = [
    configured,
    ...pathRuntimeDirs,
    join(profileHome, ".hermes", "hermes-agent"),
    join(accountHome, ".hermes", "hermes-agent"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => isHermesRuntimeDir(candidate, exists)) ?? candidates[0];
}

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
  const agentDir = resolveHermesAgentDir();
  const resolved: HermesCodexCommandOptions = {
    bridgePath: options.bridgePath ?? process.env.VESPOID_HERMES_BRIDGE ?? join(import.meta.dir, "..", "hermes-codex-oauth.py"),
    pythonPath: options.pythonPath ?? process.env.HERMES_PYTHON ?? join(agentDir, "venv", "bin", "python"),
    model: options.model ?? process.env.VESPOID_LLM_MODEL ?? "gpt-5.6-luna",
    reasoning: options.reasoning ?? (process.env.VESPOID_LLM_REASONING as HermesReasoning | undefined) ?? "high",
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
