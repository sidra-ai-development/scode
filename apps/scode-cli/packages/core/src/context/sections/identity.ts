// ============================================================
// Identity Section Builder
// ============================================================

import type { ContextSection, OutputStylePromptConfig } from "../types.js";
import { estimateTokens } from "../utils.js";

const SECURITY_NOTICE =
  "Block catastrophic data-loss or system-destructive operations.";

export function buildSecurityNotice(): string {
  return SECURITY_NOTICE;
}

export function buildHarnessBlock(): string {
  return [
    "# Harness",
    "- Make the smallest reasonable assumption and simplest correct task-only change; no unrelated refactors.",
    "- Conversation-first tool discipline: greetings, small talk, general knowledge, and explanations that do not require workspace facts must be answered directly with zero tool calls.",
    "- Do not inspect the repository, run freshness checks, git status, git diff, or any other Bash command merely because a turn or session started.",
    "- Use tools only when the user's request actually depends on workspace/code/runtime facts or asks you to perform an action.",
    "- For workspace work, use Read/Edit/Write for files and Bash only when a command is materially required.",
    "- Prefer the smallest relevant read/search before Bash; do not perform ritual repository inspection.",
    "- Prefer short relative file paths inside the working directory; preserve explicit absolute/external paths.",
    "- Batch independent tool calls.",
    "- If exact Edit path/old/new are given, call Edit directly; it reads the file internally.",
    "- After successful Edit/Write, do not re-read unless uncertain or requested.",
    "- Work autonomously; use the smallest relevant verification.",
    "- Do not commit or push unless explicitly asked.",
    `- ${SECURITY_NOTICE}`,
    "- Final report: concise changed, verified, remaining.",
  ].join("\n");
}

function buildIdentityPrompt(outputStyle?: OutputStylePromptConfig): string {
  return outputStyle
    ? ["", "Follow the active Output Style while using SCODE tools.", "", buildHarnessBlock()].join("\n")
    : ["", buildHarnessBlock()].join("\n");
}

export function buildIdentitySection(outputStyle?: OutputStylePromptConfig): ContextSection {
  const content = buildIdentityPrompt(outputStyle);

  return {
    name: "Agent Identity",
    source: "identity",
    injectionTarget: "system",
    cacheHint: "stable",
    chars: content.length,
    tokens: estimateTokens(content),
    content,
    preview: content.slice(0, 100),
  };
}
