import { buildContextSelection } from "../selections.js";
const MIN_CONTEXT_TOKENS = 4096;
async function handleContextCommand(args, deps) {
  if (!deps.getContextStatus || !deps.setContextWindow) {
    return {
      mode: deps.getMode?.(),
      response: "Context control is not available in this client."
    };
  }
  const normalized = args.trim().toLowerCase();
  if (!normalized) {
    const status2 = await deps.getContextStatus();
    return {
      mode: deps.getMode?.(),
      response: "",
      selection: buildContextSelection(status2)
    };
  }
  if (normalized === "status" || normalized === "list") {
    return {
      mode: deps.getMode?.(),
      response: formatContextStatus(await deps.getContextStatus())
    };
  }
  if (normalized === "max" || normalized === "auto") {
    return {
      mode: deps.getMode?.(),
      response: formatContextStatus(await deps.setContextWindow(void 0), "Context reset")
    };
  }
  let requested;
  try {
    requested = parseContextTokens(normalized);
  } catch (error) {
    return {
      mode: deps.getMode?.(),
      response: error instanceof Error ? error.message : String(error)
    };
  }
  const status = await deps.setContextWindow(requested);
  return {
    mode: deps.getMode?.(),
    response: formatContextStatus(status, "Context updated")
  };
}
function parseContextTokens(value) {
  const normalized = value.trim().toLowerCase();
  const multiplier = normalized.endsWith("k") ? 1024 : normalized.endsWith("m") ? 1048576 : 1;
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
function formatContextStatus(status, prefix) {
  const effective = formatTokens(status.contextWindow);
  const modelMax = status.modelContextWindow ? formatTokens(status.modelContextWindow) : "unknown";
  const source = status.overridden ? "session override" : "model maximum";
  return [
    prefix ? `${prefix}: ${effective}.` : `Context: ${effective}.`,
    `Model maximum: ${modelMax}. Source: ${source}.`,
    "Use /context <tokens> to cap it, /context max to restore the model maximum, or /compact to compact now."
  ].join("\n");
}
function formatTokens(tokens) {
  return tokens % 1024 === 0 ? `${tokens / 1024}k` : String(tokens);
}
export {
  handleContextCommand,
  parseContextTokens
};
