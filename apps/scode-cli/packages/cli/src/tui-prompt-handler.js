import { getDefaultConfigPath, updateMcpServerInFileConfig, updateUiLocaleInFileConfig } from "@zcode/adapters/config";
import { DEFAULT_LOCALE } from "@zcode/i18n";
import { createCommandCenter, parseSlashCommand } from "./command-center.js";
import { resolveDisplayLocale } from "./locale.js";
import { readRuntimeEventSubscriber } from "./runtime-event-subscriber.js";
import { createTuiSessionEventRelay } from "./tui-session-event-relay.js";
import { attachTuiAppQueries, readTuiSessionMetadata } from "./tui-prompt-handler-queries.js";
import {
  createTuiProcessRuntimeState,
  prepareTuiAppRuntime
} from "./tui-prompt-handler-runtime.js";
import { DEFAULT_CLI_CLEANUP_TIMEOUT_MS, runCliCleanupWithTimeout } from "./shutdown.js";
import {
  configureApiKeyForTui,
  loginBigmodelForTui,
  loginForTui,
  logoutForTui
} from "./tui-auth.js";
import {
  listCustomCommandsForTui,
  listSessionsForTui,
  listSkillsForTui,
  loadCustomCommandForTui
} from "./tui-command-data.js";
import {
  currentCliMode,
  readTuiMode
} from "./tui-command-state.js";
import { createTuiModelAvailabilityChecker } from "./tui-login-state.js";
import { withTuiMetadata } from "./tui-submit-metadata.js";
function createTuiSubmitPrompt(deps, modeState, version, resumeRequest = { continueSession: false }, uiLocale, uiDetectedLocale, startupLocale = DEFAULT_LOCALE, toolDisallowlist, forceMcs = false, browserUse, browserExecutable) {
  let app;
  let activeUiLocale = uiLocale;
  let contextWindowOverride;
  let hasConfiguredDefaultModelSelection = false;
  const processRuntime = createTuiProcessRuntimeState();
  let closeHandlerPromise;
  const closePromises = /* @__PURE__ */ new WeakMap();
  const cleanupTimeoutMs = Math.max(
    1,
    Math.trunc(deps.shutdownCleanupTimeoutMs ?? DEFAULT_CLI_CLEANUP_TIMEOUT_MS)
  );
  const permissionBroker = {
    requestPermission: async (request, requestOptions) => {
      const requestPermission = activeRequestPermission;
      if (!requestPermission) {
        return {
          decision: "deny",
          reason: `No interactive approval handler configured for ${request.toolName}`,
          resolvedAt: /* @__PURE__ */ new Date()
        };
      }
      return await requestPermission(request, requestOptions);
    }
  };
  const closeApp = async (targetApp = app) => {
    if (!targetApp) return;
    const closeKey = targetApp;
    let closePromise = closePromises.get(closeKey);
    if (!closePromise) {
      closePromise = (async () => {
        await runCliCleanupWithTimeout(async () => targetApp.close?.(), cleanupTimeoutMs);
      })();
      closePromises.set(closeKey, closePromise);
    }
    await closePromise;
  };
  const sessionEventRelay = createTuiSessionEventRelay({
    currentRuntime: () => app?.runtime,
    readSubscriber: readRuntimeEventSubscriber
  });
  const replaceApp = async (factory) => {
    const previousApp = app;
    const nextApp = await factory();
    app = nextApp;
    if (previousApp && previousApp !== nextApp) {
      await closeApp(previousApp);
    }
    sessionEventRelay.reattach();
    modeState.current = readTuiMode(app, currentCliMode(modeState));
    return app;
  };
  const createApp = async (request) => {
    if (closeHandlerPromise) throw new Error("TUI prompt handler is closed");
    const {
      appEnv,
      configuredDefaultModelSelection,
      createAppFactory,
      providerRegistryRuntime,
      sessionId,
      workingDirectory
    } = await prepareTuiAppRuntime(deps, version, request, processRuntime);
    hasConfiguredDefaultModelSelection = Boolean(configuredDefaultModelSelection);
    let createdApp;
    try {
      createdApp = await createAppFactory({
        env: appEnv,
        projectConfigPath: deps.projectConfigPath,
        providerRegistry: providerRegistryRuntime.runtime.registryService,
        configuredDefaultModelSelection,
        resume: sessionId !== void 0,
        runtimeConfig: {
          ...modeState.override ? { mode: modeState.override } : {},
          ...toolDisallowlist ? { toolDisallowlist } : {},
          ...forceMcs ? { midConversationSystem: { mode: "force" } } : {},
          ...contextWindowOverride === void 0 ? {} : { compact: { contextWindow: contextWindowOverride } },
          modelStreaming: "on",
          dynamicWorkflowEnabled: false,
          subagents: { enabled: false },
          memory: { enabled: false, use: false, extractionEnabled: false },
          workingDirectory
        },
        sessionId,
        skipUserConfig: deps.skipUserConfig,
        uiDetectedLocale,
        uiLocale: activeUiLocale,
        userConfigPath: deps.userConfigPath,
        version
      });
    } catch (error) {
      throw error;
    }
    if (closeHandlerPromise) {
      await closeApp(createdApp);
      throw new Error("TUI prompt handler is closed");
    }
    await processRuntime.localMlxServer?.ensureSelection(createdApp.getCurrentModelOption?.()?.ref);
    modeState.current = readTuiMode(createdApp, currentCliMode(modeState));
    return createdApp;
  };
  const getApp = async () => {
    app ??= await createApp(resumeRequest);
    modeState.current = readTuiMode(app, currentCliMode(modeState));
    return app;
  };
  const resumeApp = async (sessionId) => {
    return await replaceApp(
      async () => await createApp(
        sessionId ? {
          continueSession: false,
          resumeSessionId: sessionId
        } : {
          continueSession: true
        }
      )
    );
  };
  const newApp = async () => {
    return await replaceApp(
      async () => await createApp({
        continueSession: false
      })
    );
  };
  const setCliMode = async (nextMode) => {
    modeState.override = nextMode;
    if (app) {
      const modeCapableApp = app;
      if (modeCapableApp.setMode) {
        const result = await modeCapableApp.setMode(nextMode);
        modeState.current = readTuiMode(modeCapableApp, result.mode);
        return modeState.current;
      }
      modeCapableApp.runtime.updateConfig({ mode: nextMode });
    }
    modeState.current = app ? readTuiMode(app, nextMode) : nextMode;
    return modeState.current;
  };
  const getContextStatus = async () => {
    const activeApp = await getApp();
    const modelContextWindow = activeApp.getCurrentModelOption?.()?.contextWindow;
    const contextWindow = contextWindowOverride === void 0 ? modelContextWindow : modelContextWindow === void 0 ? contextWindowOverride : Math.min(contextWindowOverride, modelContextWindow);
    if (contextWindow === void 0) {
      throw new Error("The selected model does not declare a context window.");
    }
    return {
      contextWindow,
      ...modelContextWindow === void 0 ? {} : { modelContextWindow },
      overridden: contextWindowOverride !== void 0
    };
  };
  const setContextWindow = async (requested) => {
    const activeApp = await getApp();
    const modelContextWindow = activeApp.getCurrentModelOption?.()?.contextWindow;
    contextWindowOverride = requested === void 0 ? void 0 : modelContextWindow === void 0 ? requested : Math.min(requested, modelContextWindow);
    const configurableApp = activeApp;
    configurableApp.runtime?.updateConfig?.({
      compact: { contextWindow: contextWindowOverride }
    });
    return await getContextStatus();
  };
  const commandCenter = createCommandCenter({
    addMcpServer: async ({ name, url, protocolVersion = "auto" }) => {
      const currentApp = await getApp();
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch {
        throw new Error("MCP URL must be a valid http:// or https:// URL.");
      }
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error("MCP URL must use http:// or https://.");
      }
      await updateMcpServerInFileConfig(
        deps.userConfigPath ?? getDefaultConfigPath(),
        name,
        {
          type: "http",
          url,
          enabled: true,
          protocolVersion
        }
      );
      return await resumeApp(currentApp.sessionId);
    },
    forkApp: async (targetCheckpointId) => {
      const activeApp = await getApp();
      const result = await activeApp.forkFromCheckpoint?.({ targetCheckpointId });
      if (!result) {
        throw new Error("Forking is not available in this client.");
      }
      await replaceApp(
        async () => await createApp({
          continueSession: false,
          resumeSessionId: result.forkedSessionId
        })
      );
      return {
        copiedMessageCount: result.copiedMessageCount,
        forkedSessionId: result.forkedSessionId,
        response: `${result.response}
Switched to forked session ${result.forkedSessionId}.`,
        restoredFileCount: result.restoredFileCount ?? result.restoredFiles?.length ?? 0
      };
    },
    getApp,
    getContextStatus,
    getMode: () => currentCliMode(modeState),
    getLocale: () => app?.getLocale?.() ?? resolveDisplayLocale(activeUiLocale, uiDetectedLocale) ?? startupLocale,
    hasSelectableModels: createTuiModelAvailabilityChecker(getApp),
    listCustomCommands: () => listCustomCommandsForTui(deps),
    listSessions: () => listSessionsForTui(deps),
    listSkills: () => listSkillsForTui(deps),
    configureApiKey: (options) => configureApiKeyForTui(deps, options),
    login: (options) => loginForTui(deps, options),
    loginBigmodel: (options) => loginBigmodelForTui(deps, options),
    loadCustomCommand: (name) => loadCustomCommandForTui(deps, name),
    newApp,
    prepareModelSelection: async (selection) => {
      await processRuntime.localMlxServer?.ensureSelection(selection);
    },
    recordInputHistory: async (input, kind) => {
      await app?.recordInputHistory?.(input, kind);
    },
    resumeApp,
    saveDefaultModelSelection: async (selection) => {
      const runtime = await processRuntime.providerRegistryRuntimePromise;
      if (!runtime?.modelSelectionConfigRepository) {
        throw new Error("Default model configuration storage is unavailable.");
      }
      await runtime.modelSelectionConfigRepository.saveConfiguredDefault(selection);
    },
    logout: () => logoutForTui(deps),
    setContextWindow,
    setLocale: async (locale) => {
      if (app?.setLocale) {
        const result = await app.setLocale(locale);
        activeUiLocale = locale;
        return result;
      }
      activeUiLocale = locale;
      const persisted = await updateUiLocaleInFileConfig(
        deps.userConfigPath ?? getDefaultConfigPath(),
        locale
      );
      return {
        configPath: persisted.path,
        locale: resolveDisplayLocale(locale, uiDetectedLocale) ?? "en-US",
        requestedLocale: locale
      };
    },
    setMode: setCliMode
  });
  const submitPrompt = async (input, options) => {
    const result = await commandCenter(input, options);
    return app ? { ...result, ...await readTuiSessionMetadata(await getApp()) } : result;
  };
  submitPrompt.setMode = async (nextMode) => ({ mode: await setCliMode(nextMode) });
  submitPrompt.sendInput = async (input, options) => {
    const command = parseSlashCommand(typeof input === "string" ? input : input.text);
    if (command?.type === "known" && (command.name === "model" || command.name === "effort" || command.name === "context" || command.name === "mcp" || command.name === "theme")) {
      return {
        kind: "command_result",
        result: await submitPrompt(input, {
          ...options,
          abortSignal: options?.abortSignal ?? new AbortController().signal
        })
      };
    }
    const activeApp = await getApp();
    if (activeApp.sendInput) {
      const result = await activeApp.sendInput(input, options);
      if (result.kind !== "started_turn") return result;
      return withTuiMetadata(result.result, activeApp, currentCliMode(modeState));
    }
    return withTuiMetadata(
      await activeApp.submitPrompt(input, options),
      activeApp,
      currentCliMode(modeState)
    );
  };
  attachTuiAppQueries(submitPrompt, getApp, () => hasConfiguredDefaultModelSelection);
  submitPrompt.subscribeSessionEvents = (sink) => {
    const unsubscribe = sessionEventRelay.addSink(sink);
    void getApp().then(
      () => sessionEventRelay.reattach(),
      () => void 0
    );
    return unsubscribe;
  };
  submitPrompt.getMainSessionId = () => {
    const runtime = app?.runtime;
    const sessionId = runtime?.getSessionId?.();
    return typeof sessionId === "string" && sessionId.length > 0 ? sessionId : void 0;
  };
  submitPrompt.close = async () => {
    closeHandlerPromise ??= (async () => {
      await closeApp();
      await runCliCleanupWithTimeout(
        async () => processRuntime.shutdownTelemetry?.(),
        cleanupTimeoutMs
      );
      await runCliCleanupWithTimeout(
        async () => processRuntime.localMlxServer?.close(),
        cleanupTimeoutMs
      );
      const providerRegistryRuntime = await processRuntime.providerRegistryRuntimePromise;
      providerRegistryRuntime?.dispose();
    })();
    await closeHandlerPromise;
  };
  return submitPrompt;
}
export {
  createTuiSubmitPrompt
};
