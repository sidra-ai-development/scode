import {
  discoverLocalMlxModels,
  LocalMlxServerController,
} from "./local-mlx-runtime.js";

export type ScodeLocalWorkerMode = "off" | "auto" | "local";
export type ScodeLocalWorkerEffort = "low" | "high";

export function parseScodeLocalWorkerMode(value: unknown): ScodeLocalWorkerMode {
  return value === "auto" || value === "local" ? value : "off";
}

export function parseScodeLocalWorkerEffort(value: unknown): ScodeLocalWorkerEffort {
  return value === "high" ? "high" : "low";
}

export async function discoverScodeLocalWorkerModels(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  const configured = parseConfiguredModels(env.SCODE_LOCAL_MLX_MODELS);
  if (configured.length > 0) return configured;
  return await discoverLocalMlxModels(env);
}

export function chooseScodeLocalWorkerModel(
  models: readonly string[],
  preferred?: string,
): string | undefined {
  if (preferred && models.includes(preferred)) return preferred;
  if (models.length === 0) return undefined;
  const ranked = [...models].sort((left, right) => {
    const delta = modelRank(left) - modelRank(right);
    return delta !== 0 ? delta : left.localeCompare(right);
  });
  return ranked[0];
}

export function createScodeLocalWorkerController(
  env: NodeJS.ProcessEnv = process.env,
): LocalMlxServerController {
  return new LocalMlxServerController(env);
}

function parseConfiguredModels(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
  } catch {
    return [];
  }
}

function modelRank(modelPath: string): number {
  const name = modelPath.toLowerCase();
  const match = name.match(/(?:^|[-_])([0-9]+(?:[.][0-9]+)?)b(?:[-_]|$)/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const billions = Number(match[1]);
  return Number.isFinite(billions) ? billions : Number.MAX_SAFE_INTEGER;
}
