import { extname } from "node:path";
import { formatJson } from "@zcode/core";
import { loadBootstrapModule } from "./bootstrap-loader.js";
import {
  createCommandCenter,
  formatSlashCommandHelp,
  parseSlashCommand
} from "./command-center.js";
import { loadCliDotenv } from "./env.js";
import { discoverLocalMlxModels, LocalMlxServerController } from "./local-mlx-runtime.js";
import {
  createHeadlessPermissionBroker,
  createHeadlessSessionObserver
} from "./headless-workflow.js";
import { resolveResumeSession } from "./resume.js";
import { readRuntimeEventSubscriber } from "./runtime-event-subscriber.js";
import {
  DEFAULT_CLI_CLEANUP_TIMEOUT_MS,
  registerCliShutdownHandlers,
  runCliCleanupWithTimeout
} from "./shutdown.js";
const wantsJsonSummary = (options) => options.outputFormat === void 0 ? options.json : options.outputFormat === "json" || options.outputFormat === "stream-json";
const wantsEventStream = (options) => options.outputFormat === "stream-json";
const IMAGE_EXTENSIONS = /* @__PURE__ */ new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const VIDEO_EXTENSIONS = /* @__PURE__ */ new Set([".mp4", ".m4v", ".mov", ".webm", ".mkv", ".avi"]);
const EMPTY_PROMPT_ERROR = "--prompt requires non-empty text.";
const TARGET_SELECTION_UNAVAILABLE_ERROR = "Headless goal commands cannot open an interactive replacement picker. Re-run with --target-replace or use /goal replace <objective>.";
const runPrompt = async (ctx, prompt, attachmentPaths, options, deps, version, mode, resumeRequest = { continueSession: false }, toolDisallowlist, forceMcs = false, presentationSurface = "terminal") => {
  if (prompt.trim().length === 0) {
    ctx.stderr.write(`${EMPTY_PROMPT_ERROR}
`);
    return 1;
  }
  const slashCommand = parseSlashCommand(prompt);
  if (slashCommand?.type === "known" && slashCommand.name === "help") {
    ctx.stdout.write(
      `${formatSlashCommandHelp(slashCommand.args)}
`
    );
    return 0;
  }
  const runtimePrompt = prompt;
  let traceId;
  let app;
  let closePromise;
  let localMlxServer;
  let detachEvents;
  const stopObservingEvents = () => {
    detachEvents?.();
    detachEvents = void 0;
  };
  let providerRegistryRuntime;
  const abortController = new AbortController();
  const cleanupTimeoutMs = Math.max(
    1,
    Math.trunc(deps.shutdownCleanupTimeoutMs ?? DEFAULT_CLI_CLEANUP_TIMEOUT_MS)
  );
  const closeApp = async () => {
    const targetApp = app;
    closePromise ??= (async () => {
      await runCliCleanupWithTimeout(async () => targetApp?.close?.(), cleanupTimeoutMs);
      await runCliCleanupWithTimeout(async () => localMlxServer?.close(), cleanupTimeoutMs);
      providerRegistryRuntime?.dispose();
    })();
    await closePromise;
  };
  const unregisterShutdownHandlers = registerCliShutdownHandlers({
    abort: (signal) => abortController.abort(new Error(`CLI received ${signal}`)),
    cleanup: closeApp,
    cleanupTimeoutMs: deps.shutdownCleanupTimeoutMs,
    exitProcess: deps.exitProcess,
    process: deps.shutdownProcess
  });
  try {
    const env = deps.env ?? process.env;
    const workingDirectory = (deps.cwd ?? process.cwd)();
    const dotenvResult = (deps.loadDotenv ?? loadCliDotenv)({
      cwd: workingDirectory,
      env
    });
    if (dotenvResult.error) {
      throw new Error(`Failed to load environment file: ${dotenvResult.path}`, {
        cause: dotenvResult.error
      });
    }
    const sessionId = await resolveResumeSession(resumeRequest, workingDirectory, env, deps);
    const bootstrapModule = deps.createZCodeApp ? void 0 : await loadBootstrapModule();
    const createApp = deps.createZCodeApp ?? bootstrapModule?.createZCodeApp;
    if (!createApp) throw new Error("SCODE app factory is unavailable.");
    const streamsEvents = wantsEventStream(options);
    let mapSessionEvent;
    if (streamsEvents) {
      mapSessionEvent = deps.mapSessionEvent ?? bootstrapModule?.mapSessionEvent;
      if (!mapSessionEvent) {
        throw new Error("Event streaming is unavailable: the bootstrap module did not load.");
      }
    }
    const observer = createHeadlessSessionObserver({
      ...mapSessionEvent ? { mapSessionEvent } : {},
      options,
      stderr: ctx.stderr,
      stdout: ctx.stdout
    });
    const configuredLocalModels = env.SCODE_LOCAL_MLX_MODELS?.trim();
    const discoveredLocalModels = configuredLocalModels ? [] : await discoverLocalMlxModels(env);
    const appEnv = configuredLocalModels || discoveredLocalModels.length === 0 ? env : { ...env, SCODE_LOCAL_MLX_MODELS: JSON.stringify(discoveredLocalModels) };
    localMlxServer = new LocalMlxServerController(appEnv);
    const startProviderRegistryRuntime = deps.startProcessProviderRegistryRuntime ?? bootstrapModule?.startProcessProviderRegistryRuntime;
    if (!startProviderRegistryRuntime) {
      throw new Error("Provider Registry runtime is unavailable.");
    }
    providerRegistryRuntime = await startProviderRegistryRuntime(appEnv, {});
    app = await createApp({
      env: appEnv,
      // headless 没有交互审批面，core 因此退到 deny broker，于是 CreateWorkflow 的
      // alwaysAsk gate 在 -p 下**必然被拒**（"No permission client configured"）。
      // 这个最小 broker 只按工具名放行 CreateWorkflow，其余工具委托回同一个 deny
      // broker，语义逐字不变。详见 headless-workflow.ts 的注释。
      permissionBroker: createHeadlessPermissionBroker(),
      providerRegistry: providerRegistryRuntime.runtime.registryService,
      configuredDefaultModelSelection: providerRegistryRuntime.configuredDefaultModelSelection,
      resume: sessionId !== void 0,
      runtimeConfig: {
        ...mode ? { mode } : {},
        ...toolDisallowlist ? { toolDisallowlist } : {},
        ...forceMcs ? { midConversationSystem: { mode: "force" } } : {},
        dynamicWorkflowEnabled: false,
        memory: { extractionEnabled: false },
        modelStreaming: "on",
        presentationSurface,
        workingDirectory
      },
      sessionId,
      uiDetectedLocale: options.detectedLocale,
      uiLocale: options.locale,
      version
    });
    if (abortController.signal.aborted) {
      const lateApp = app;
      app = void 0;
      await runCliCleanupWithTimeout(async () => lateApp.close?.(), cleanupTimeoutMs);
      throw abortController.signal.reason;
    }
    await localMlxServer.ensureSelection(app.getCurrentModelOption?.()?.ref);
    traceId = app.traceId;
    if (slashCommand && routesToPromptCommandCenter(slashCommand)) {
      return await runPromptCommandCenterCommand(
        ctx,
        options,
        app,
        prompt,
        mode,
        traceId,
        abortController.signal,
        deps
      );
    }
    const subscribeEvents = readRuntimeEventSubscriber(app.runtime);
    detachEvents = subscribeEvents?.({ onSessionEvent: observer.observe });
    const result = await app.submitPrompt(
      attachmentPaths.length > 0 ? {
        text: runtimePrompt,
        attachments: attachmentPaths.map((path) => ({
          type: inferAttachmentTypeFromPath(path),
          path
        }))
      } : runtimePrompt,
      {
        abortSignal: abortController.signal,
        // 常驻订阅装上了就绝不再装 per-turn sink（见上面的单一写者注释）。
        ...detachEvents ? {} : { onEvent: observer.observe }
      }
    );
    observer.beginWaitPhase(result.turnId ? String(result.turnId) : void 0);
    traceId = result.traceId ?? traceId;
    stopObservingEvents();
    const turnResponses = [result.response, ...observer.waitPhaseTurnResponses()].filter(
      (text) => text.trim().length > 0
    );
    const response = turnResponses.at(-1) ?? result.response;
    const multiTurn = turnResponses.length > 1;
    if (streamsEvents) {
      ctx.stdout.write(
        `${JSON.stringify({
          type: "result",
          sessionId: app.sessionId,
          traceId,
          ...result.turnId ? { turnId: result.turnId } : {},
          response,
          ...multiTurn ? { turnResponses } : {},
          ...result.usage ? { usage: { ...result.usage } } : {},
          eventCount: result.events.length,
          projection: {
            status: result.projection.status,
            turnCount: result.projection.turnCount,
            totalTokenCount: result.projection.totalTokenCount,
            contextUsed: result.projection.contextUsed ?? null,
            contextWindow: result.projection.contextWindow ?? null
          }
        })}
`
      );
      return 0;
    }
    if (wantsJsonSummary(options)) {
      ctx.stdout.write(
        formatJson({
          sessionId: app.sessionId,
          traceId,
          ...result.turnId ? { turnId: result.turnId } : {},
          response,
          ...multiTurn ? { turnResponses } : {},
          ...result.usage ? { usage: { ...result.usage } } : {},
          eventCount: result.events.length,
          projection: {
            status: result.projection.status,
            turnCount: result.projection.turnCount,
            totalTokenCount: result.projection.totalTokenCount,
            contextUsed: result.projection.contextUsed ?? null,
            contextWindow: result.projection.contextWindow ?? null
          }
        })
      );
      return 0;
    }
    ctx.stdout.write(`${turnResponses.join("\n\n")}
`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.stderr.write(`Error: ${message}${traceId ? ` (traceId: ${traceId})` : ""}
`);
    if (options.verbose) {
      if (error instanceof Error && error.cause) {
        ctx.stderr.write(`Cause: ${error.cause}
`);
      }
      if (error instanceof Error && error.stack) {
        ctx.stderr.write(`${error.stack}
`);
      }
    }
    return 1;
  } finally {
    stopObservingEvents();
    unregisterShutdownHandlers();
    await closeApp();
  }
};
function inferAttachmentTypeFromPath(path) {
  const extension = extname(path).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (extension === ".pdf") return "pdf";
  return "file";
}
function routesToPromptCommandCenter(slashCommand) {
  return slashCommand.type === "unknown";
}
async function runPromptCommandCenterCommand(ctx, options, app, prompt, mode, traceId, abortSignal, deps) {
  const commandCenter = createCommandCenter({
    getApp: async () => app,
    getMode: () => app.getMode?.() ?? mode ?? "build",
    recordInputHistory: async (input, kind) => {
      await app.recordInputHistory?.(input, kind);
    },
    resumeApp: async () => app,
    setLocale: async (locale) => {
      if (!app.setLocale) {
        throw new Error("Locale switching is not available in this client.");
      }
      return await app.setLocale(locale);
    }
  });
  const result = await commandCenter(prompt, {
    abortSignal
  });
  const nextTraceId = result.traceId ?? traceId;
  if (result.selection) {
    ctx.stderr.write(
      `Error: ${result.response}
${TARGET_SELECTION_UNAVAILABLE_ERROR}${nextTraceId ? ` (traceId: ${nextTraceId})` : ""}
`
    );
    return 1;
  }
  if (options.memoryBench) {
    await app.runtime.drainMemoryExtractions(null);
    abortSignal.throwIfAborted();
  }
  if (wantsJsonSummary(options)) {
    ctx.stdout.write(
      formatJson({
        sessionId: String(app.sessionId),
        ...nextTraceId ? { traceId: nextTraceId } : {},
        response: result.response
      })
    );
    return 0;
  }
  ctx.stdout.write(`${result.response}
`);
  return 0;
}
export {
  runPrompt
};
