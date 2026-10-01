export interface ScodeToolClassification {
  failed: boolean;
  reason?: string;
}

export function classifyScodeToolResult(result: {
  success: boolean;
  toolName: string;
  output?: unknown;
  modelContent?: unknown;
  serialization?: { content?: unknown };
  error?: { message?: string };
}): ScodeToolClassification {
  if (!result.success) {
    return { failed: true, reason: result.error?.message ?? "Tool execution failed" };
  }

  const candidates: unknown[] = [
    result.output,
    result.modelContent,
    result.serialization?.content,
  ];
  const outputContent =
    result.output && typeof result.output === "object" && !Array.isArray(result.output)
      ? (result.output as { content?: unknown }).content
      : undefined;
  if (Array.isArray(outputContent)) {
    for (const block of outputContent) {
      if (
        block &&
        typeof block === "object" &&
        !Array.isArray(block) &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string"
      ) {
        candidates.push((block as { text: string }).text);
      }
    }
  }

  for (const candidate of candidates) {
    let value = candidate;
    if (typeof value === "string") {
      const rawText = value;
      try {
        value = JSON.parse(rawText);
      } catch {
        if (
          result.toolName.startsWith("mcp__sidra__") &&
          (rawText.includes('"ok":false') ||
            rawText.includes('"toolOutcome":"failure"') ||
            rawText.includes('"commandOutcome":"failed"'))
        ) {
          return { failed: true, reason: "Underlying SIDRA tool reported failure" };
        }
        continue;
      }
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const status = typeof record.status === "string" ? record.status : undefined;
    const exitCode = typeof record.exitCode === "number" ? record.exitCode : undefined;
    if (
      status === "failed" ||
      status === "timed_out" ||
      status === "cancelled" ||
      status === "spawn_error" ||
      (exitCode !== undefined && exitCode !== 0)
    ) {
      return {
        failed: true,
        reason:
          exitCode !== undefined && exitCode !== 0
            ? `Command exited with code ${exitCode}`
            : `Tool reported status ${status}`,
      };
    }
    if (
      record.ok === false ||
      record.toolOutcome === "failure" ||
      record.commandOutcome === "failed"
    ) {
      const error =
        record.error && typeof record.error === "object" && !Array.isArray(record.error)
          ? (record.error as Record<string, unknown>)
          : undefined;
      return {
        failed: true,
        reason:
          (typeof error?.message === "string" && error.message) ||
          (typeof record.message === "string" && record.message) ||
          "Underlying tool reported failure",
      };
    }
  }

  return { failed: false };
}

export function compactScodeToolResult(result: {
  toolCallId: string;
  toolName: string;
  success: boolean;
  durationMs?: number;
  output?: unknown;
  modelContent?: unknown;
  serialization?: {
    content?: unknown;
    originalBytes?: number;
    returnedBytes?: number;
    truncated?: boolean;
    budgetStrategy?: string;
    artifactPath?: string;
  };
  error?: { type?: string; message?: string; code?: string };
}) {
  const classification = classifyScodeToolResult(result);
  let outputPreview: string | undefined;
  try {
    const raw =
      result.serialization?.content ??
      (typeof result.output === "string" ? result.output : JSON.stringify(result.output));
    if (typeof raw === "string" && raw.length > 0) {
      outputPreview = raw.length > 1200 ? `${raw.slice(0, 1200)}…` : raw;
    }
  } catch {}

  return {
    toolCallId: result.toolCallId,
    toolName: result.toolName,
    success: result.success && !classification.failed,
    transportSuccess: result.success,
    durationMs: result.durationMs,
    ...(classification.failed && classification.reason
      ? { failureReason: classification.reason }
      : {}),
    ...(result.error
      ? {
          error: {
            type: result.error.type,
            message: result.error.message,
            ...(result.error.code ? { code: result.error.code } : {}),
          },
        }
      : {}),
    ...(outputPreview ? { outputPreview } : {}),
    ...(result.serialization
      ? {
          output: {
            originalBytes: result.serialization.originalBytes,
            returnedBytes: result.serialization.returnedBytes,
            truncated: result.serialization.truncated,
            budgetStrategy: result.serialization.budgetStrategy,
            ...(result.serialization.artifactPath
              ? { artifactPath: result.serialization.artifactPath }
              : {}),
          },
        }
      : {}),
  };
}
