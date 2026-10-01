import type { TuiSubmitPromptResult } from "@zcode/tui";
import { buildContextSelection } from "../selections.js";
import type { CommandCenterContextStatus, CommandCenterDeps } from "../types.js";

const MIN_CONTEXT_TOKENS = 4_096;

export async function handleContextCommand(
  args: string,
  deps: CommandCenterDeps,
): Promise<TuiSubmitPromptResult> {
  if (!deps.getContextStatus || !deps.setContextWindow) {
    return {
      mode: deps.getMode?.(),
      response: "Context control is not available in this client.",
    };
  }

  const normalized = args.trim().toLowerCase();
  if (!normalized) {
    const status = await deps.getContextStatus();
    return {
      mode: deps.getMode?.(),
      response: "",
      selection: buildContextSelection(status),
    };
  }

  if (normalized === "status" || normalized === "list") {
    return {
      mode: deps.getMode?.(),
      response: formatContextStatus(await deps.getContextStatus()),
    };
  }

  if (normalized === "max" || normalized === "auto") {
    return {
      mode: deps.getMode?.(),
      response: formatContextStatus(await deps.setContextWindow(undefined), "Context reset"),
    };
  }

  let requested: number;
  try {
    requested = parseContextTokens(normalized);
  } catch (error) {
    return {
      mode: deps.getMode?.(),
      response: error instanceof Error ? error.message : String(error),
    };
  }

  const status = await deps.setContextWindow(requested);
  return {
    mode: deps.getMode?.(),
    response: formatContextStatus(status, "Context updated"),
  };
}

export function parseContextTokens(value: string): number {
  const normalized = value.trim().toLowerCase();
  const multiplier = normalized.endsWith("k")
    ? 1_024
    : normalized.endsWith("m")
      ? 1_048_576
      : 1;
  const numeric = multiplier === 1 ? normalized : normalized.slice(0, -1).trim();
  const parsed = Number(numeric);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Usage: /context [max|auto|<tokens>] (examples: 64k, 128k, 200k)");
  }
  const tokens = Math.floor(parsed * multiplier);
  if (tokens < MIN_CONTEXT_TOKENS) {
    throw new Error("Context must be at least 4k tokens.");
  }
  return tokens;
}

function formatContextStatus(status: CommandCenterContextStatus, prefix?: string): string {
  const effective = formatTokens(status.contextWindow);
  const modelMax = status.modelContextWindow ? formatTokens(status.modelContextWindow) : "unknown";
  const source = status.overridden ? "session override" : "model maximum";
  return [
    prefix ? `${prefix}: ${effective}.` : `Context: ${effective}.`,
    `Model maximum: ${modelMax}. Source: ${source}.`,
    "Use /context <tokens> to cap it, /context max to restore the model maximum, or /compact to compact now.",
  ].join("\n");
}

function formatTokens(tokens: number): string {
  return tokens % 1_024 === 0 ? `${tokens / 1_024}k` : String(tokens);
}
