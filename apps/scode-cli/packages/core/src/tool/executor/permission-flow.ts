import type {
  CollaborationMode,
  TraceContext,
  ToolExecutionSpanWriter,
} from "@zcode/contracts";
import type { HookRunResult } from "../../hooks/index.js";
import type { ExecutableToolCall, ToolEntry, ToolExecutionResult } from "../types.js";
import { createPermissionErrorResult } from "./errors.js";
import type { ToolExecutorDeps } from "./types.js";

type ToolPermissionFlowResult =
  | { allowed: true; executionInput: unknown; permissionWaitMs?: number }
  | { allowed: false; result: ToolExecutionResult };

const CATASTROPHIC_PATTERNS: readonly RegExp[] = [
  /\bdiskutil\s+(?:eraseDisk|partitionDisk|eraseVolume|secureErase)\b/i,
  /\b(?:mkfs(?:\.[a-z0-9_+-]+)?|newfs(?:_[a-z0-9_+-]+)?)\b/i,
  /\bdd\b[^\n;&|]*\bof=\/dev\/(?:r?disk|nvme|sd[a-z])/i,
  /\bfind\s+(?:\/|~|\$HOME)\b[^\n;&|]*\s-delete\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[a-z]*f[a-z]*d[a-z]*x[a-z]*\b/i,
];

function readBashCommand(toolCall: ExecutableToolCall, input: unknown): string | undefined {
  if (toolCall.name !== "Bash" || typeof input !== "object" || input === null) return undefined;
  const command = (input as Record<string, unknown>).command;
  return typeof command === "string" ? command : undefined;
}

function isCatastrophicRm(command: string): boolean {
  const normalized = command.replace(/["']/g, "").replace(/\s+/g, " ").trim();
  if (!/\brm\b/i.test(normalized)) return false;

  const recursiveForce =
    /\brm\b[^;&|\n]*(?:-[a-z]*r[a-z]*f|-([a-z]*f[a-z]*r)|-r\b[^;&|\n]*\s-f\b|-f\b[^;&|\n]*\s-r\b)/i.test(
      normalized,
    );
  if (!recursiveForce) return false;

  return /(?:^|\s)(?:\/|\/\*|~|~\/\*|\$HOME|\$HOME\/\*|\.|\.\/|\.\/\*|\.\.|\.\.\/\*|\/Users(?:\/[^\s]+)?|\/System(?:\/|\s)|\/Library(?:\/|\s)|\/Applications(?:\/|\s)|\/Volumes(?:\/|\s))(?:\s|$|[;&|])/i.test(
    normalized,
  );
}

function destructiveReason(toolCall: ExecutableToolCall, input: unknown): string | undefined {
  const command = readBashCommand(toolCall, input);
  if (!command) return undefined;
  if (isCatastrophicRm(command) || CATASTROPHIC_PATTERNS.some((pattern) => pattern.test(command))) {
    return "Blocked destructive command: SCODE full access does not permit catastrophic data-loss operations.";
  }
  return undefined;
}

export async function resolveToolPermission(
  _deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  _entry: ToolEntry,
  executionInput: unknown,
  _preToolHookResult: HookRunResult,
  mode: CollaborationMode,
  _traceContext: TraceContext,
  _signal?: AbortSignal,
  _telemetry?: ToolExecutionSpanWriter,
): Promise<ToolPermissionFlowResult> {
  const reason = destructiveReason(toolCall, executionInput);
  if (reason) {
    return {
      allowed: false,
      result: createPermissionErrorResult(toolCall, reason, {
        decision: "deny",
        mode,
        reasonSource: "scode_destructive_guard",
      }),
    };
  }
  return { allowed: true, executionInput };
}
