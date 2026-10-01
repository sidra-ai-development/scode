import {
  ModelConfig,
  parseAccountProviderConfigMap,
  type AccountProviderConfigSnapshot,
  type AccountProviderStates,
} from "@zcode/provider";
import { isBuiltinModelProviderId } from "@zcode/shared";
import {
  NodeModelSelectionConfigRepository,
  NodeProviderRegistryRuntime,
  resolveNodeProviderRuntimePaths,
  ZCODE_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV,
} from "@zcode/provider-node";

export interface ProcessProviderRegistryRuntimeOptions {
  // SCODE local runtime has no remote account layer.
}

export async function startProcessProviderRegistryRuntime(
  env: Readonly<Record<string, string | undefined>>,
  _options: ProcessProviderRegistryRuntimeOptions = {},
) {
  const paths = resolveNodeProviderRuntimePaths(env);
  if (!paths) {
    throw new Error("Missing local provider registry paths");
  }

  const bundledFile = env[ZCODE_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV]?.trim();
  const runtime = new NodeProviderRegistryRuntime({
    ...paths,
    ...(bundledFile
      ? {
          zcodeBuiltinFilePath: bundledFile,
          zcodeBuiltinActiveFilePath: paths.zcodeBuiltinFilePath,
        }
      : {}),
  });

  try {
    await runtime.start();
    await registerLocalMlxModels(runtime, env);
    await registerLocalOllamaModels(runtime, env);
    const snapshot = runtime.registryService.getSnapshot()!;
    const modelSelectionConfigRepository = new NodeModelSelectionConfigRepository({
      personalRepository: runtime.personalRepository,
    });
    try {
      const configuredDefaultModelSelection = await modelSelectionConfigRepository.read();
      return Object.freeze({
        async syncAccountProviderConfig(): Promise<boolean> {
          return false;
        },
        dispose() {
          modelSelectionConfigRepository.dispose();
          runtime.dispose();
        },
        runtime,
        snapshot,
        modelSelectionConfigRepository,
        configuredDefaultModelSelection,
      });
    } catch (error) {
      modelSelectionConfigRepository.dispose();
      throw error;
    }
  } catch (error) {
    runtime.dispose();
    throw error;
  }
}

async function registerLocalMlxModels(
  runtime: NodeProviderRegistryRuntime,
  env: Readonly<Record<string, string | undefined>>,
): Promise<void> {
  const modelIds = parseLocalMlxModelIds(env.SCODE_LOCAL_MLX_MODELS);
  if (modelIds.length === 0) return;

  const providerId = "scode-local-mlx";
  let changed = false;
  for (const modelId of modelIds) {
    if (runtime.registryService.getModel(providerId, modelId)) continue;
    await runtime.configService.addPersonalModel(providerId, modelId, ModelConfig.empty());
    changed = true;
  }
  if (changed) {
    await runtime.registryService.refresh("scode-local-mlx-discovery");
  }
}

async function registerLocalOllamaModels(
  runtime: NodeProviderRegistryRuntime,
  env: Readonly<Record<string, string | undefined>>,
): Promise<void> {
  const baseUrl = (env.SCODE_OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const modelIds = await discoverOllamaModelIds(baseUrl);
  if (modelIds.length === 0) return;

  const providerId = "scode-local-ollama";
  let changed = false;
  for (const modelId of modelIds) {
    if (runtime.registryService.getModel(providerId, modelId)) continue;
    await runtime.configService.addPersonalModel(providerId, modelId, ModelConfig.empty());
    changed = true;
  }
  if (changed) {
    await runtime.registryService.refresh("scode-local-ollama-discovery");
  }
}

async function discoverOllamaModelIds(baseUrl: string): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(800),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      models?: Array<{ name?: unknown; model?: unknown }>;
    };
    const ids = (payload.models ?? [])
      .map((entry) =>
        typeof entry.name === "string"
          ? entry.name.trim()
          : typeof entry.model === "string"
            ? entry.model.trim()
            : "",
      )
      .filter(Boolean);
    return [...new Set(ids)];
  } catch {
    return [];
  }
}

function parseLocalMlxModelIds(value: string | undefined): string[] {
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

/** Legacy protocol parser kept only so old protocol modules still compile. */
export function parseProcessAccountProviderConfigSnapshot(input: {
  readonly revision: string;
  readonly basedOnZCodeBuiltinRevision: string;
  readonly providers: unknown;
  readonly states?: AccountProviderStates;
}): AccountProviderConfigSnapshot {
  const revision = input.revision.trim();
  if (!revision) throw new Error("Account Config revision cannot be empty");
  const basedOnZCodeBuiltinRevision = input.basedOnZCodeBuiltinRevision.trim();
  if (!basedOnZCodeBuiltinRevision) {
    throw new Error("Account Config Built-in revision cannot be empty");
  }
  const providers = parseAccountProviderConfigMap(input.providers);
  for (const [providerId, provider] of providers.entries()) {
    if (
      isBuiltinModelProviderId(providerId) &&
      provider.access?.type === "zhipu-account" &&
      provider.access.entitled &&
      typeof input.states?.[providerId]?.current !== "boolean"
    ) {
      throw new Error(`Account State missing current: ${providerId}`);
    }
  }
  return Object.freeze({
    revision,
    basedOnZCodeBuiltinRevision,
    providers,
    ...(input.states ? { states: input.states } : {}),
  });
}
