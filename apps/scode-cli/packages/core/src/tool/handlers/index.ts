// ============================================================
// SCODE Built-in Tool Handlers
// ============================================================

import type { ToolEntry } from "../types.js";
import { readToolEntry } from "./read.js";
import { writeToolEntry } from "./write.js";
import { editToolEntry } from "./edit.js";
import { bashToolEntry, createBashToolEntry } from "./bash.js";
import { globToolEntry } from "./glob.js";
import { grepToolEntry } from "./grep.js";
import { taskOutputToolEntry } from "./task-output.js";
import { taskStopToolEntry } from "./task-stop.js";
import type { BashTimeoutPolicy } from "../bash-timeout-policy.js";

export const builtInTools: ToolEntry[] = [
  readToolEntry,
  writeToolEntry,
  editToolEntry,
  bashToolEntry,
  globToolEntry,
  grepToolEntry,
  taskOutputToolEntry,
  taskStopToolEntry,
];

/**
 * The legacy option surface is intentionally preserved so existing runtime
 * callers compile unchanged. SCODE only consumes the options relevant to its
 * four local tools.
 */
interface RegisterBuiltInToolsOptions {
  bashTimeoutPolicy?: BashTimeoutPolicy;
  embeddedSearchEnabled?: boolean;
  allowedTools?: readonly string[];
  disallowedTools?: readonly string[];
  silentDuplicateWarnings?: boolean;

  // Compatibility-only options from the upstream ZCode registry.
  includeSkill?: boolean;
  includeAgent?: boolean;
  includeSendMessage?: boolean;
  includeRespondToCoordinator?: boolean;
  includeSubmitResult?: boolean;
  submitResultSchema?: unknown;
  includeEscalate?: boolean;
  includeWorkflow?: boolean;
  includeAutomation?: boolean;
  includeOffPeak?: boolean;
  includeDynamicWorkflow?: boolean;
  includeNodeRepl?: boolean;
  includeBrowserUse?: boolean;
  agentProfiles?: readonly unknown[];
}

export function registerBuiltInTools(
  registry: {
    register(entry: ToolEntry, options?: { silentDuplicateWarning?: boolean }): void;
  },
  options: RegisterBuiltInToolsOptions = {},
): void {
  const allowedTools = options.allowedTools ? new Set(options.allowedTools) : undefined;
  const disallowedTools = options.disallowedTools ? new Set(options.disallowedTools) : undefined;

  for (const entry of builtInTools) {
    if (allowedTools && !allowedTools.has(entry.metadata.name)) continue;
    if (disallowedTools?.has(entry.metadata.name)) continue;

    registry.register(resolveBuiltInToolEntry(entry, options), {
      silentDuplicateWarning: options.silentDuplicateWarnings,
    });
  }
}

function resolveBuiltInToolEntry(
  entry: ToolEntry,
  options: RegisterBuiltInToolsOptions,
): ToolEntry {
  if (entry.metadata.name === "Bash") {
    return createBashToolEntry({
      bashTimeoutPolicy: options.bashTimeoutPolicy,
      embeddedSearchEnabled: options.embeddedSearchEnabled,
    });
  }
  return entry;
}
