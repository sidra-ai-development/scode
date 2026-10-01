import type {
  CollaborationMode,
  PermissionBrokerResult,
  TraceContext,
} from "@zcode/contracts";
import type { HookRunResult } from "../../hooks/index.js";
import type { PermissionDecisionResult } from "../../permission/service.js";
import type { ExecutableToolCall, ToolEntry } from "../types.js";
import type { ToolExecutorDeps } from "./types.js";

const EMPTY_HOOK_RESULT: HookRunResult = { additionalContexts: [] };

export async function runPreToolUseHooks(
  _deps: ToolExecutorDeps,
  _toolCall: ExecutableToolCall,
  _input: unknown,
  _entry: ToolEntry,
  _mode: CollaborationMode,
  _traceContext: TraceContext,
  _signal?: AbortSignal,
): Promise<HookRunResult> {
  return EMPTY_HOOK_RESULT;
}

export async function runPermissionRequestHooks(
  _deps: ToolExecutorDeps,
  _toolCall: ExecutableToolCall,
  _input: unknown,
  _requestId: string,
  _permissionDecision: PermissionDecisionResult,
  _mode: CollaborationMode,
  _traceContext: TraceContext,
  _signal?: AbortSignal,
): Promise<PermissionBrokerResult | undefined> {
  return undefined;
}

export async function runPostToolUseHooks(
  _deps: ToolExecutorDeps,
  _toolCall: ExecutableToolCall,
  _input: unknown,
  _output: unknown,
  _artifactPath: string | undefined,
  _traceContext: TraceContext,
  _signal?: AbortSignal,
): Promise<HookRunResult> {
  return EMPTY_HOOK_RESULT;
}

export async function runPostToolUseFailureHooks(
  _deps: ToolExecutorDeps,
  _toolCall: ExecutableToolCall,
  _input: unknown,
  _error: unknown,
  _traceContext: TraceContext,
  _signal?: AbortSignal,
): Promise<HookRunResult> {
  return EMPTY_HOOK_RESULT;
}

export function applyPreToolPermissionDecision(
  permissionDecision: PermissionDecisionResult,
  _hookResult: HookRunResult,
  _mode: CollaborationMode,
): PermissionDecisionResult {
  return permissionDecision;
}

export function formatHookAdditionalContexts(additionalContexts: string[]): string {
  return [
    "[Hook additional context]",
    ...additionalContexts.map((context, index) => `#${index + 1}\n${context}`),
  ].join("\n");
}
