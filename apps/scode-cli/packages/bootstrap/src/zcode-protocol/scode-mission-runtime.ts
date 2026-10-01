import { compactScodeToolResult, classifyScodeToolResult } from "./scode-execution-result.js";
import {
  saveScodeMission,
  type ScodeMissionPhase,
  type ScodeMissionSnapshot,
  type ScodeMissionToolCall,
} from "./scode-mission-store.js";
import type {
  ZCodeProtocolAgentServerContext,
  ZCodeProtocolSessionRecord,
} from "./server-types.js";

export function parseScodeMissionPhases(value: unknown): ScodeMissionPhase[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Mission requires at least one phase");
  }

  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Mission phase ${index} must be an object`);
    }
    const phase = raw as {
      id?: unknown;
      description?: unknown;
      toolCalls?: unknown;
      checkpoint?: unknown;
      checkpointReason?: unknown;
      onFailure?: unknown;
    };
    const id =
      typeof phase.id === "string" && phase.id.trim()
        ? phase.id.trim()
        : `phase-${index + 1}`;
    const toolCalls = parseToolCalls(phase.toolCalls);
    const checkpoint = phase.checkpoint === true;
    if (toolCalls.length === 0 && !checkpoint) {
      throw new Error(`Mission phase ${id} requires toolCalls or checkpoint=true`);
    }
    const onFailure =
      phase.onFailure === "fail" ? ("fail" as const) : ("pause" as const);
    return {
      id,
      toolCalls,
      onFailure,
      ...(typeof phase.description === "string" && phase.description.trim()
        ? { description: phase.description.trim() }
        : {}),
      ...(checkpoint ? { checkpoint: true } : {}),
      ...(typeof phase.checkpointReason === "string" && phase.checkpointReason.trim()
        ? { checkpointReason: phase.checkpointReason.trim() }
        : {}),
    };
  });
}

export async function executeScodeMission(
  context: ZCodeProtocolAgentServerContext,
  record: ZCodeProtocolSessionRecord,
  mission: ScodeMissionSnapshot,
  controller: AbortController,
  options: {
    initializeMcp?: () => Promise<void>;
  } = {},
): Promise<ScodeMissionSnapshot> {
  const store = context.deps.sessionStore;

  while (mission.currentPhaseIndex < mission.phases.length) {
    if (controller.signal.aborted) {
      settleMission(mission, "cancelled", "SCODE mission cancelled");
      await saveScodeMission(store, mission);
      return mission;
    }

    const phase = mission.phases[mission.currentPhaseIndex]!;
    let phaseFailed = false;
    let failureReason: string | undefined;
    let compactResults: unknown[] = [];
    let scheduleSummary:
      | { executionOrder?: unknown; parallelGroups?: unknown }
      | undefined;

    if (phase.toolCalls.length > 0) {
      if (
        phase.toolCalls.some((call) => call.name.startsWith("mcp__")) &&
        options.initializeMcp
      ) {
        await options.initializeMcp();
      }

      const schedule = await record.app.runtime.scheduleTools(phase.toolCalls);
      const execution = await record.app.runtime.executeTools(phase.toolCalls, schedule, {
        signal: controller.signal,
      });
      scheduleSummary = {
        executionOrder: schedule.executionOrder,
        parallelGroups: schedule.parallelGroups,
      };
      compactResults = execution.results.map((result) => compactScodeToolResult(result));
      const failed = execution.results
        .map((result) => classifyScodeToolResult(result))
        .filter((classification) => classification.failed);
      phaseFailed = failed.length > 0;
      failureReason =
        failed
          .map((classification) => classification.reason)
          .filter((reason): reason is string => Boolean(reason))
          .join("; ") || undefined;
    }

    mission.phaseResults.push({
      phaseId: phase.id,
      status: phaseFailed ? "failed" : "completed",
      completedAt: new Date().toISOString(),
      ...(scheduleSummary ? { schedule: scheduleSummary } : {}),
      results: compactResults,
      ...(failureReason ? { failureReason } : {}),
    });
    mission.currentPhaseIndex += 1;
    mission.updatedAt = new Date().toISOString();

    if (controller.signal.aborted) {
      settleMission(mission, "cancelled", "SCODE mission cancelled");
      await saveScodeMission(store, mission);
      return mission;
    }

    if (phaseFailed) {
      if (phase.onFailure === "fail") {
        settleMission(mission, "failed", failureReason ?? `Phase ${phase.id} failed`);
      } else {
        mission.status = "needs_reasoning";
        mission.reasoningReason =
          failureReason ?? `Phase ${phase.id} failed and requires ChatGPT reasoning`;
        delete mission.error;
      }
      await saveScodeMission(store, mission);
      return mission;
    }

    if (phase.checkpoint) {
      mission.status = "needs_reasoning";
      mission.reasoningReason =
        phase.checkpointReason ??
        phase.description ??
        `Checkpoint after phase ${phase.id}`;
      delete mission.error;
      await saveScodeMission(store, mission);
      return mission;
    }

    await saveScodeMission(store, mission);
  }

  settleMission(mission, "completed");
  await saveScodeMission(store, mission);
  return mission;
}

export function summarizeScodeMission(mission: ScodeMissionSnapshot) {
  return {
    missionId: mission.missionId,
    sessionId: mission.sessionId,
    objective: mission.objective,
    status: mission.status,
    currentPhaseIndex: mission.currentPhaseIndex,
    totalPhases: mission.phases.length,
    completedPhases: mission.phaseResults.length,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
    ...(mission.completedAt ? { completedAt: mission.completedAt } : {}),
    ...(mission.reasoningReason ? { reasoningReason: mission.reasoningReason } : {}),
    ...(mission.error ? { error: mission.error } : {}),
  };
}

function parseToolCalls(value: unknown): ScodeMissionToolCall[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Mission phase toolCalls must be an array");
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Mission toolCalls[${index}] must be an object`);
    }
    const call = raw as { id?: unknown; name?: unknown; input?: unknown };
    if (typeof call.id !== "string" || !call.id.trim()) {
      throw new Error(`Mission toolCalls[${index}].id is required`);
    }
    if (typeof call.name !== "string" || !call.name.trim()) {
      throw new Error(`Mission toolCalls[${index}].name is required`);
    }
    return {
      id: call.id.trim(),
      name: call.name.trim(),
      input: call.input ?? {},
    };
  });
}

function settleMission(
  mission: ScodeMissionSnapshot,
  status: "completed" | "failed" | "cancelled",
  error?: string,
): void {
  mission.status = status;
  mission.updatedAt = new Date().toISOString();
  mission.completedAt = mission.updatedAt;
  delete mission.reasoningReason;
  if (error) mission.error = error;
  else delete mission.error;
}
