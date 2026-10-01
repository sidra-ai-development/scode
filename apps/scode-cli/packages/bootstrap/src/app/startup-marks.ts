import type { ConfigResult } from "@zcode/adapters/config";
import type { AgentRuntimeConfig } from "@zcode/core";
import type { Logger, McpServerConfig, PluginLoadOutcome } from "@zcode/contracts";
import type { StartupTimer } from "../startup-logging.js";
import type { ZCodeAppOptions } from "./types.js";

export function resolveStartupPlugins(input: {
  cliStorageRoot: string;
  configResult: ConfigResult;
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
  options: Pick<ZCodeAppOptions, "officialPluginRoots" | "pluginStorageRoot">;
  startupTimer: StartupTimer;
  workingDirectory: string;
}): PluginLoadOutcome {
  const pluginOutcome: PluginLoadOutcome = {
    commandRoots: [],
    diagnostics: [],
    hooks: {},
    mcpServers: {},
    plugins: [],
    skillRoots: [],
  };
  input.startupTimer.mark("SCODE plugin discovery skipped", {
    context: {
      commandRootCount: 0,
      diagnosticCount: 0,
      enabledPluginCount: 0,
      hookCount: 0,
      mcpServerCount: 0,
      pluginCount: 0,
      skillRootCount: 0,
    },
    event: "bootstrap.app.startup.plugins.skipped",
    stage: "resolve_plugins",
  });
  return pluginOutcome;
}

export function startAppStartup(input: {
  hasInjectedModelAdapter: boolean;
  resume: boolean;
  startupTimer: StartupTimer;
}): void {
  input.startupTimer.start("ZCode app startup started", {
    context: {
      hasInjectedModelAdapter: input.hasInjectedModelAdapter,
      resume: input.resume,
    },
    event: "bootstrap.app.startup.started",
    stage: "start",
  });
}

export function markConfigurationLoaded(input: {
  configResult: ConfigResult;
  startupTimer: StartupTimer;
}): void {
  input.startupTimer.mark("ZCode app configuration loaded", {
    context: {
      configSourceEnv: input.configResult.sources.env,
      configSourceProject: input.configResult.sources.project.loaded,
      configSourceUser: input.configResult.sources.user.loaded,
    },
    event: "bootstrap.app.startup.config.completed",
    stage: "load_config",
  });
}

export function markStorageAdaptersInitialized(input: {
  cliStorageRoot: string;
  hasInjectedArtifactStore: boolean;
  hasInjectedSessionStore: boolean;
  startupTimer: StartupTimer;
  storageRoot: string;
}): void {
  input.startupTimer.mark("ZCode storage adapters initialized", {
    context: {
      hasInjectedArtifactStore: input.hasInjectedArtifactStore,
      hasInjectedSessionStore: input.hasInjectedSessionStore,
      cliStorageRoot: input.cliStorageRoot,
      storageRoot: input.storageRoot,
    },
    event: "bootstrap.app.startup.storage.completed",
    stage: "initialize_storage",
  });
}

export function markMcpAdapterInitialized(input: {
  configuredMcpServers: Record<string, McpServerConfig>;
  hasInjectedMcpPort: boolean;
  mcpEnabled: boolean;
  startupTimer: StartupTimer;
  trustedMcpServerCount: number;
}): void {
  input.startupTimer.mark("ZCode MCP adapter initialized", {
    context: {
      hasInjectedMcpPort: input.hasInjectedMcpPort,
      mcpEnabled: input.mcpEnabled,
      mcpServerCount: Object.keys(input.configuredMcpServers).length,
      trustedMcpServerCount: input.trustedMcpServerCount,
    },
    event: "bootstrap.app.startup.mcp.completed",
    stage: "initialize_mcp",
  });
}

export function markRuntimeConstructed(input: {
  hasInjectedModelAdapter: boolean;
  sessionId: string;
  startupTimer: StartupTimer;
}): void {
  input.startupTimer.mark("ZCode runtime constructed", {
    context: {
      hasInjectedModelAdapter: input.hasInjectedModelAdapter,
      sessionId: input.sessionId,
    },
    event: "bootstrap.app.startup.runtime.completed",
    stage: "create_runtime",
  });
}

export function completeAppStartup(input: {
  sessionId: string;
  startupTimer: StartupTimer;
  workingDirectory: string;
}): void {
  input.startupTimer.complete("ZCode app startup completed", {
    context: {
      sessionId: input.sessionId,
      workingDirectory: input.workingDirectory,
    },
    event: "bootstrap.app.startup.completed",
    stage: "total",
  });
}

export function debugRuntimeConfigResolved(input: {
  configResult: ConfigResult;
  logger: Logger;
  runtimeConfig: AgentRuntimeConfig;
}): void {
  input.logger.debug("Runtime config resolved", {
    mode: input.runtimeConfig.mode,
    module: "bootstrap",
    permissionAllowedToolCount: input.configResult.config.permission.allowedTools.length,
    permissionDisallowedToolCount: input.configResult.config.permission.disallowedTools.length,
    permissionSourceEnv: input.configResult.sources.env,
    permissionSourceUserConfig: input.configResult.sources.user.loaded,
  });
}
