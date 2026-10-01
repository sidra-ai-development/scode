import {
  discoverLocalMlxModels,
  LocalMlxServerController
} from "./local-mlx-runtime.js";
function parseScodeLocalWorkerMode(value) {
  return value === "auto" || value === "local" ? value : "off";
}
function parseScodeLocalWorkerEffort(value) {
  return value === "high" ? "high" : "low";
}
async function discoverScodeLocalWorkerModels(env = process.env) {
  const configured = parseConfiguredModels(env.SCODE_LOCAL_MLX_MODELS);
  if (configured.length > 0) return configured;
  return await discoverLocalMlxModels(env);
}
function chooseScodeLocalWorkerModel(models, preferred) {
  if (preferred && models.includes(preferred)) return preferred;
  if (models.length === 0) return void 0;
  const ranked = [...models].sort((left, right) => {
    const delta = modelRank(left) - modelRank(right);
    return delta !== 0 ? delta : left.localeCompare(right);
  });
  return ranked[0];
}
function createScodeLocalWorkerController(env = process.env) {
  return new LocalMlxServerController(env);
}
function parseConfiguredModels(value) {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean)
      )
    ];
  } catch {
    return [];
  }
}
function modelRank(modelPath) {
  const name = modelPath.toLowerCase();
  const match = name.match(/(?:^|[-_])([0-9]+(?:[.][0-9]+)?)b(?:[-_]|$)/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const billions = Number(match[1]);
  return Number.isFinite(billions) ? billions : Number.MAX_SAFE_INTEGER;
}
export {
  chooseScodeLocalWorkerModel,
  createScodeLocalWorkerController,
  discoverScodeLocalWorkerModels,
  parseScodeLocalWorkerEffort,
  parseScodeLocalWorkerMode
};
