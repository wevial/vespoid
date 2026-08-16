#!/usr/bin/env python3
"""Run one prompt through Hermes's OpenAI-Codex OAuth provider."""

from __future__ import annotations

import argparse
from contextlib import redirect_stdout
import os
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="gpt-5.6-luna")
    parser.add_argument("--reasoning", default="high")
    args = parser.parse_args()

    prompt = sys.stdin.read().strip()
    if not prompt:
        print("Prompt is required on stdin", file=sys.stderr)
        return 2

    agent_dir = Path(
        os.environ.get("HERMES_AGENT_DIR", Path.home() / ".hermes" / "hermes-agent")
    )
    sys.path.insert(0, str(agent_dir))

    from hermes_cli.runtime_provider import resolve_runtime_provider
    from run_agent import AIAgent

    runtime = resolve_runtime_provider(
        requested="openai-codex", target_model=args.model
    )
    agent = AIAgent(
        base_url=runtime["base_url"],
        api_key=runtime["api_key"],
        provider=runtime["provider"],
        api_mode=runtime["api_mode"],
        credential_pool=runtime.get("credential_pool"),
        model=args.model,
        reasoning_config={"enabled": True, "effort": args.reasoning},
        max_iterations=2,
        enabled_toolsets=[],
        tool_delay=0,
        quiet_mode=True,
        ephemeral_system_prompt=(
            "You are a deterministic data-transformation worker. Return exactly the "
            "format requested by the user and never call tools."
        ),
        skip_context_files=True,
        load_soul_identity=False,
        skip_memory=True,
        max_tokens=6000,
    )
    agent._persist_disabled = True
    # Hermes writes retry/status diagnostics to stdout. Keep this bridge's
    # stdout machine-readable by routing those diagnostics to stderr.
    with redirect_stdout(sys.stderr):
        result = agent.run_conversation(prompt)

    if result.get("failed") is True or result.get("completed") is False:
        error = str(result.get("error") or "provider returned an incomplete result")
        print(f"Hermes provider inference failed: {error}", file=sys.stderr)
        return 1

    response = (result.get("final_response") or "").strip()
    if not response:
        print("Hermes returned no final response", file=sys.stderr)
        return 1

    sys.stdout.write(response)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
