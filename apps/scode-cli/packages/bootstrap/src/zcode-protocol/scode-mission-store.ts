import type { SessionId, SessionStorePort } from "@zcode/contracts";

export type ScodeMissionStatus =
  | "running"
  | "needs_reasoning"
  | "completed"
  | "failed"
  | "cancelled";

export interface ScodeMissionToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ScodeMissionPhase {
  id: string;
  description?: string;
  toolCalls: ScodeMissionToolCall[];
  checkpoint?: boolean;
  checkpointReason?: string;
  onFailure: "pause" | "fail";
}

export interface ScodeMissionPhaseResult {
  phaseId: string;
  status: "completed" | "failed";
  completedAt: string;
  schedule?: {
    executionOrder?: unknown;
    parallelGroups?: unknown;
  };
  results: unknown[];
  failureReason?: string;
}

export interface ScodeMissionSnapshot {
  schema: 1;
  missionId: string;
  sessionId: string;
  objective: string;
  status: ScodeMissionStatus;
  phases: ScodeMissionPhase[];
  currentPhaseIndex: number;
  phaseResults: ScodeMissionPhaseResult[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  reasoningReason?: string;
  error?: string;
}

const MISSION_ENTRY_TYPE = "runtime/scode_mission";

export async function saveScodeMission(
  store: SessionStorePort | undefined,
  mission: ScodeMissionSnapshot,
): Promise<void> {
  if (!store?.saveSessionEntry) return;
  const created = Date.parse(mission.createdAt);
  const updated = Date.parse(mission.updatedAt);
  await store.saveSessionEntry({
    id: `scode-mission:${mission.missionId}`,
    sessionID: mission.sessionId as SessionId,
    type: MISSION_ENTRY_TYPE,
    time: {
      created: Number.isFinite(created) ? created : Date.now(),
      updated: Number.isFinite(updated) ? updated : Date.now(),
    },
    data: mission,
  });
}

export async function readScodeMissions(
  store: SessionStorePort | undefined,
  sessionId: string,
): Promise<ScodeMissionSnapshot[]> {
  if (!store?.sessionEntries) return [];
  const entries = await store.sessionEntries({ sessionID: sessionId as SessionId, type: MISSION_ENTRY_TYPE });
  return entries
    .map((entry) => parseMission(entry.data))
    .filter((mission): mission is ScodeMissionSnapshot => mission !== undefined)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function readScodeMission(
  store: SessionStorePort | undefined,
  sessionId: string,
  missionId: string,
): Promise<ScodeMissionSnapshot | undefined> {
  return (await readScodeMissions(store, sessionId)).find(
    (mission) => mission.missionId === missionId,
  );
}

function parseMission(value: unknown): ScodeMissionSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const mission = value as Partial<ScodeMissionSnapshot>;
  if (
    mission.schema !== 1 ||
    typeof mission.missionId !== "string" ||
    typeof mission.sessionId !== "string" ||
    typeof mission.objective !== "string" ||
    !Array.isArray(mission.phases) ||
    !Array.isArray(mission.phaseResults) ||
    typeof mission.currentPhaseIndex !== "number" ||
    typeof mission.createdAt !== "string" ||
    typeof mission.updatedAt !== "string" ||
    !isMissionStatus(mission.status)
  ) {
    return undefined;
  }
  return mission as ScodeMissionSnapshot;
}

function isMissionStatus(value: unknown): value is ScodeMissionStatus {
  return (
    value === "running" ||
    value === "needs_reasoning" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled"
  );
}
