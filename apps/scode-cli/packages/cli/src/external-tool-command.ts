import type { RunContext } from "@zcode/shared-types";
import type { CliPermissionMode, RunDependencies } from "./cli-types.js";
import { loadBootstrapModule } from "./bootstrap-loader.js";

const EXTERNAL_TOOL_NAMES = new Set(["Read", "Edit", "Write", "Bash"]);

type ExternalToolCallInput = {
  id?: string;
  input?: unknown;
  name: string;
};

export async function runExternalToolCommand(
  ctx: RunContext,
  args: readonly string[],
  deps: RunDependencies,
  version: string,
  mode: CliPermissionMode,
): Promise<number> {
  if (args.length !== 1) {
    ctx.stderr.write("Usage: scode tool <json>\n");
    return 1;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(args[0] ?? "");
  } catch {
    ctx.stderr.write("scode tool expects valid JSON.\n");
    return 1;
  }

  const requested = Array.isArray(parsed) ? parsed : [parsed];
  if (requested.length === 0) {
    ctx.stderr.write("scode tool requires at least one tool call.\n");
    return 1;
  }

  const toolCalls = requested.map((value, index) => normalizeToolCall(value, index));
  const bootstrap = await loadBootstrapModule();
  const createApp = deps.createZCodeApp ?? bootstrap?.createZCodeApp;
  const startProviderRegistryRuntime =
    deps.startProcessProviderRegistryRuntime ?? bootstrap?.startProcessProviderRegistryRuntime;
  if (!createApp || !startProviderRegistryRuntime) {
    throw new Error("SCODE external tool runtime is unavailable.");
  }

  const env = deps.env ?? process.env;
  const providerRuntime = await startProviderRegistryRuntime(env, {});
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  let unsubscribe: (() => void) | undefined;
  const eventTypes: string[] = [];

  try {
    app = await createApp({
      env,
      projectConfigPath: deps.projectConfigPath,
      providerRegistry: providerRuntime.runtime.registryService,
      configuredDefaultModelSelection: providerRuntime.configuredDefaultModelSelection,
      runtimeConfig: {
        mode,
        modelStreaming: "off",
        dynamicWorkflowEnabled: false,
        subagents: { enabled: false },
        memory: { enabled: false, use: false, extractionEnabled: false },
        workingDirectory: (deps.cwd ?? process.cwd)(),
      },
      skipUserConfig: deps.skipUserConfig,
      userConfigPath: deps.userConfigPath,
      version,
    });

    unsubscribe = app.runtime.subscribeEvents({
      onSessionEvent(event) {
        eventTypes.push(String(event.type));
      },
    });

    const executor = app.runtime.getToolExecutor();
    const results =
      toolCalls.length === 1
        ? [await executor.execute(toolCalls[0]!)]
        : await executor.executeBatch(toolCalls);

    const modelRequestCount = eventTypes.filter(
      (type) => type.toLowerCase().replace(/[^a-z]/g, "") === "modelrequest",
    ).length;

    ctx.stdout.write(
      JSON.stringify(
        { mode, modelRequestCount, results, toolCount: results.length },
        null,
        2,
      ) + "\n",
    );
    return results.every((result) => result.success) ? 0 : 1;
  } finally {
    unsubscribe?.();
    await app?.close?.();
    providerRuntime.dispose();
  }
}

function normalizeToolCall(value: unknown, index: number) {
  if (!isRecord(value) || typeof value.name !== "string" || !EXTERNAL_TOOL_NAMES.has(value.name)) {
    throw new Error(
      "Tool call " + (index + 1) + " must name one of: " + [...EXTERNAL_TOOL_NAMES].join(", ") + ".",
    );
  }
  return {
    id:
      typeof value.id === "string" && value.id.trim()
        ? value.id
        : "external_tool_" + (index + 1),
    input: value.input ?? {},
    name: value.name,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}