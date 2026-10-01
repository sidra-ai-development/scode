import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import net from "node:net";
import { createServiceDescriptor, registerService, unregisterService } from "@zcode/server-cli/service-manager";
import { chooseScodeLocalWorkerModel, createScodeLocalWorkerController, discoverScodeLocalWorkerModels, parseScodeLocalWorkerEffort, parseScodeLocalWorkerMode } from "./scode-local-worker.js";
function pathsFor(workspacePath) {
  const workspace = resolve(workspacePath);
  const key = createHash("sha256").update(workspace).digest("hex").slice(0, 16);
  const root = join(homedir(), ".zcode", "scode-runtime");
  mkdirSync(root, { recursive: true });
  return {
    workspace,
    key,
    socketPath: process.platform === "win32"
      ? String.raw`\\.\pipe\scode-runtime-${key}`
      : join(tmpdir(), `scode-runtime-${key}.sock`),
    metaPath: join(root, `${key}.json`),
    logPath: join(root, `${key}.log`),
    servicePath: join(root, `${key}.plist`),
    serviceName: `ai.scode.runtime.${key}`
  };
}
function requestKey(id) {
  return id === void 0 ? void 0 : `${typeof id}:${String(id)}`;
}
function runtimePreferences() {
  return {
    nativeSearchEnhancementsEnabled: true,
    memoryEnabled: true,
    askUserQuestionAutoResolutionEnabled: true,
    modelContextBudgetStrategy: "preflight-v1"
  };
}
function scodeRuntimeSidraServers() {
  const mode = process.env.SCODE_SIDRA_MODE?.trim().toLowerCase();
  if (mode === "off") return [];
  const url = process.env.SCODE_SIDRA_MCP_URL?.trim();
  if (!url) return [];
  return [
    {
      name: "sidra",
      type: "http",
      url,
      headers: [],
      isolation: "workspace",
      protocolVersion: "legacy",
      timeoutMs: 15e3
    }
  ];
}
function localWorkerState(metadata, models) {
  const mode = parseScodeLocalWorkerMode(metadata.localWorkerMode);
  const savedModel = metadata.localWorkerModelExplicit === true && typeof metadata.localWorkerModelId === "string" && metadata.localWorkerModelId.trim() ? metadata.localWorkerModelId.trim() : void 0;
  return {
    mode,
    effort: parseScodeLocalWorkerEffort(metadata.localWorkerEffort),
    modelId: chooseScodeLocalWorkerModel(models, savedModel),
    models
  };
}
function parseJsonLine(line) {
  try {
    const value = JSON.parse(line);
    return value && typeof value === "object" ? value : void 0;
  } catch {
    return void 0;
  }
}
function readMetadata(metaPath) {
  try {
    const value = JSON.parse(readFileSync(metaPath, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
function updateMetadata(metaPath, patch) {
  writeFileSync(metaPath, JSON.stringify({ ...readMetadata(metaPath), ...patch }, null, 2));
}
function resolveRuntimeSocketPath(paths) {
  const metadata = readMetadata(paths.metaPath);
  const storedSocketPath = metadata.workspace === paths.workspace && typeof metadata.socketPath === "string" && metadata.socketPath.trim() ? metadata.socketPath.trim() : void 0;
  return storedSocketPath ?? paths.socketPath;
}
async function socketRequest(socketPath, message, timeoutMs = 5e3) {
  return await new Promise((resolvePromise, reject) => {
    const socket = net.createConnection(socketPath);
    let buffer = "";
    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.end();
      fn();
    };
    const timer = setTimeout(() => {
      socket.destroy();
      finish(() => reject(new Error(`SCODE runtime request timed out after ${timeoutMs}ms`)));
    }, timeoutMs);
    socket.once("error", (error) => finish(() => reject(error)));
    socket.once("connect", () => socket.write(`${JSON.stringify(message)}
`));
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
        if (!line) continue;
        const decoded = parseJsonLine(line);
        if (!decoded) continue;
        if (decoded.method === "session/requestRuntimePreferences" && decoded.id !== void 0) {
          socket.write(`${JSON.stringify({ id: decoded.id, result: runtimePreferences() })}
`);
          continue;
        }
        if (requestKey(decoded.id) === requestKey(message.id) && ("result" in decoded || "error" in decoded)) {
          finish(() => resolvePromise(decoded));
          return;
        }
      }
    });
  });
}
async function runtimeAlive(socketPath) {
  try {
    const response = await socketRequest(
      socketPath,
      { id: "runtime-ping", method: "scode/runtime/ping", params: {} },
      800
    );
    return Boolean(response?.result?.ok);
  } catch {
    return false;
  }
}
async function ensureExecutionSession(paths) {
  const metadata = readMetadata(paths.metaPath);
  const socketPath = resolveRuntimeSocketPath(paths);
  const existingSessionId = typeof metadata.executionSessionId === "string" && metadata.executionSessionId.trim() ? metadata.executionSessionId.trim() : void 0;
  if (existingSessionId) {
    try {
      const persisted = await socketRequest(
        socketPath,
        {
          id: `runtime-session-persisted-check-${Date.now()}`,
          method: "session/list",
          params: { sessionIds: [existingSessionId] }
        },
        5e3
      );
      const sessions = persisted?.result?.sessions;
      if (!persisted.error && Array.isArray(sessions) && sessions.some((session) => session?.sessionId === existingSessionId)) {
        return existingSessionId;
      }
    } catch {
    }
    try {
      const check = await socketRequest(
        socketPath,
        {
          id: `runtime-session-check-${Date.now()}`,
          method: "scode/tools/list",
          params: { sessionId: existingSessionId }
        },
        5e3
      );
      if (!check.error) return existingSessionId;
    } catch {
    }
  }
  const created = await socketRequest(
    socketPath,
    {
      id: `runtime-session-create-${Date.now()}`,
      method: "session/create",
      params: {
        workspace: { workspacePath: paths.workspace, workspaceKey: paths.workspace },
        persistence: "immediate",
        titleGenerationEnabled: false,
        dynamicWorkflowEnabled: false,
        offPeakToolEnabled: false,
        mcpServers: scodeRuntimeSidraServers()
      }
    },
    15e3
  );
  if (created.error) {
    throw new Error(`Failed to create SCODE execution session: ${created.error.message ?? "unknown error"}`);
  }
  const executionSessionId = created?.result?.session?.sessionId;
  if (typeof executionSessionId !== "string" || !executionSessionId.trim()) {
    throw new Error("SCODE session/create did not return sessionId");
  }
  updateMetadata(paths.metaPath, { executionSessionId });
  return executionSessionId;
}
function currentEntrypoint() {
  const entry = process.argv[1];
  if (!entry) throw new Error("Unable to resolve SCODE CLI entrypoint");
  return resolve(entry);
}
function currentCliArgs(args) {
  const entrypoint = currentEntrypoint();
  const executable = resolve(process.execPath);
  return executable === entrypoint ? args : [entrypoint, ...args];
}
async function startPersistentRuntime(workspacePath) {
  const paths = pathsFor(workspacePath);
  const existingSocketPath = resolveRuntimeSocketPath(paths);
  if (await runtimeAlive(existingSocketPath)) {
    const metadata = readMetadata(paths.metaPath);
    const executionSessionId = await ensureExecutionSession(paths);
    const pid = Number(metadata.pid) || void 0;
    return {
      alreadyRunning: true,
      pid,
      executionSessionId,
      socketPath: existingSocketPath,
      logPath: paths.logPath
    };
  }
  if (existsSync(paths.socketPath)) {
    try {
      unlinkSync(paths.socketPath);
    } catch {
    }
  }
  const platform = process.platform === "darwin" || process.platform === "linux" ? process.platform : "win32";
  const descriptor = createServiceDescriptor({
    platform,
    command: process.execPath,
    args: currentCliArgs(["--cwd", paths.workspace, "runtime-server"]),
    name: paths.serviceName
  });
  writeFileSync(paths.servicePath, descriptor.content, "utf8");
  try {
    await registerService(descriptor, paths.servicePath);
  } catch (error) {
    if (process.platform !== "win32") throw error;
    const runtimeProcess = spawn(
      process.execPath,
      currentCliArgs(["--cwd", paths.workspace, "runtime-server"]),
      {
        cwd: paths.workspace,
        env: process.env,
        detached: true,
        windowsHide: true,
        stdio: "ignore"
      }
    );
    runtimeProcess.unref();
    updateMetadata(paths.metaPath, {
      serviceMode: "detached-user-process",
      launcherPid: runtimeProcess.pid
    });
  }
  const deadline = Date.now() + 8e3;
  while (Date.now() < deadline) {
    const socketPath = resolveRuntimeSocketPath(paths);
    if (await runtimeAlive(socketPath)) {
      const executionSessionId = await ensureExecutionSession(paths);
      const metadata = readMetadata(paths.metaPath);
      return {
        alreadyRunning: false,
        pid: Number(metadata.pid) || void 0,
        executionSessionId,
        socketPath,
        logPath: paths.logPath,
        serviceName: descriptor.name
      };
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`SCODE runtime service did not become ready. See ${paths.logPath}`);
}
async function runPersistentRuntimeServer(workspacePath) {
  const paths = pathsFor(workspacePath);
  if (await runtimeAlive(paths.socketPath)) {
    throw new Error(`SCODE runtime is already running for ${paths.workspace}`);
  }
  if (existsSync(paths.socketPath)) {
    try {
      unlinkSync(paths.socketPath);
    } catch {
    }
  }
  const discoveredLocalModels = await discoverScodeLocalWorkerModels(process.env);
  const childEnv = discoveredLocalModels.length > 0 ? { ...process.env, SCODE_LOCAL_MLX_MODELS: JSON.stringify(discoveredLocalModels) } : process.env;
  const localWorker = createScodeLocalWorkerController(childEnv);
  const child = spawn(
    process.execPath,
    currentCliArgs(["--cwd", paths.workspace, "app-server", "--surface", "terminal"]),
    {
      cwd: paths.workspace,
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"]
    }
  );
  const clients = /* @__PURE__ */ new Set();
  const pending = /* @__PURE__ */ new Map();
  let childBuffer = "";
  let shuttingDown = false;
  const writeChild = (message) => {
    if (!child.stdin.destroyed) child.stdin.write(`${JSON.stringify(message)}
`);
  };
  const broadcast = (message) => {
    const line = `${JSON.stringify(message)}
`;
    for (const socket of clients) {
      if (!socket.destroyed) socket.write(line);
    }
  };
  const handleChildMessage = (message) => {
    if (message.method === "session/requestRuntimePreferences" && message.id !== void 0) {
      writeChild({ id: message.id, result: runtimePreferences() });
      return;
    }
    const key = requestKey(message.id);
    if (key && ("result" in message || "error" in message)) {
      const request = pending.get(key);
      const socket = request?.socket;
      if (socket && !socket.destroyed) {
        socket.write(`${JSON.stringify(message)}
`);
        pending.delete(key);
        if (request.afterResponse) void request.afterResponse();
        return;
      }
    }
    broadcast(message);
  };
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    childBuffer += chunk;
    let index = childBuffer.indexOf("\n");
    while (index >= 0) {
      const line = childBuffer.slice(0, index).trim();
      childBuffer = childBuffer.slice(index + 1);
      index = childBuffer.indexOf("\n");
      if (!line) continue;
      const message = parseJsonLine(line);
      if (message) handleChildMessage(message);
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  let server;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const socket of clients) socket.destroy();
    if (server?.listening) {
      await new Promise((resolveClose) => server.close(() => resolveClose()));
    }
    await localWorker.close().catch(() => void 0);
    if (!child.killed) child.kill("SIGTERM");
    try {
      unlinkSync(paths.socketPath);
    } catch {
    }
  };
  server = net.createServer((socket) => {
    clients.add(socket);
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
        if (!line) continue;
        const message = parseJsonLine(line);
        if (!message) continue;
        if (message.method === "scode/runtime/ping") {
          socket.write(`${JSON.stringify({
            id: message.id,
            result: { ok: true, pid: process.pid, childPid: child.pid, workspace: paths.workspace }
          })}
`);
          continue;
        }
        if (message.method === "scode/runtime/stop") {
          socket.write(`${JSON.stringify({ id: message.id, result: { ok: true } })}
`);
          setTimeout(() => void shutdown(), 10);
          continue;
        }
        if (message.method === "scode/local-worker/get") {
          void discoverScodeLocalWorkerModels(childEnv).then((models) => {
            const state = localWorkerState(readMetadata(paths.metaPath), models);
            socket.write(`${JSON.stringify({ id: message.id, result: state })}
`);
          }).catch((error) => {
            socket.write(
              `${JSON.stringify({
                id: message.id,
                error: {
                  code: -32007,
                  message: error instanceof Error ? error.message : String(error)
                }
              })}
`
            );
          });
          continue;
        }
        if (message.method === "scode/local-worker/set") {
          void (async () => {
            const rawMode = message.params?.mode;
            if (rawMode !== "off" && rawMode !== "auto" && rawMode !== "local") {
              throw new Error("local worker mode must be off, auto, or local");
            }
            const models = await discoverScodeLocalWorkerModels(childEnv);
            const requestedModel = typeof message.params?.modelId === "string" && message.params.modelId.trim() ? message.params.modelId.trim() : void 0;
            if (requestedModel && !models.includes(requestedModel)) {
              throw new Error(`Local MLX model is not available: ${requestedModel}`);
            }
            const effort = parseScodeLocalWorkerEffort(message.params?.effort);
            const selectedModel = chooseScodeLocalWorkerModel(models, requestedModel);
            updateMetadata(paths.metaPath, {
              localWorkerMode: rawMode,
              localWorkerEffort: effort,
              localWorkerModelExplicit: Boolean(requestedModel),
              ...selectedModel ? { localWorkerModelId: selectedModel } : {}
            });
            if (rawMode === "off") await localWorker.close();
            socket.write(
              `${JSON.stringify({
                id: message.id,
                result: { mode: rawMode, effort, modelId: selectedModel, models }
              })}
`
            );
          })().catch((error) => {
            socket.write(
              `${JSON.stringify({
                id: message.id,
                error: {
                  code: -32602,
                  message: error instanceof Error ? error.message : String(error)
                }
              })}
`
            );
          });
          continue;
        }
        if (message.method === "scode/local-worker/run") {
          void (async () => {
            const models = await discoverScodeLocalWorkerModels(childEnv);
            const metadata = readMetadata(paths.metaPath);
            const state = localWorkerState(metadata, models);
            if (state.mode === "off") {
              throw new Error("SCODE local worker is OFF");
            }
            const requestedModel = typeof message.params?.modelId === "string" && message.params.modelId.trim() ? message.params.modelId.trim() : state.modelId;
            const modelId = chooseScodeLocalWorkerModel(models, requestedModel);
            if (!modelId) throw new Error("No local MLX model is available");
            const prompt = typeof message.params?.prompt === "string" && message.params.prompt.trim() ? message.params.prompt.trim() : void 0;
            if (!prompt) throw new Error("scode/local-worker/run requires prompt");
            await localWorker.switchModel(modelId);
            updateMetadata(paths.metaPath, { localWorkerModelId: modelId });
            const key2 = requestKey(message.id);
            if (key2) {
              pending.set(key2, {
                socket,
                afterResponse: state.mode === "auto" ? () => localWorker.close() : void 0
              });
            }
            const effort = parseScodeLocalWorkerEffort(message.params?.effort ?? state.effort);
            writeChild({ ...message, params: { ...message.params, modelId, effort } });
          })().catch((error) => {
            socket.write(
              `${JSON.stringify({
                id: message.id,
                error: {
                  code: -32007,
                  message: error instanceof Error ? error.message : String(error)
                }
              })}
`
            );
          });
          continue;
        }
        const key = requestKey(message.id);
        if (key && message.method) pending.set(key, { socket });
        writeChild(message);
      }
    });
    socket.on("close", () => {
      clients.delete(socket);
      for (const [key, owner] of pending) {
        if (owner.socket === socket) pending.delete(key);
      }
    });
    socket.on("error", () => {
      clients.delete(socket);
    });
  });
  child.once("exit", () => {
    if (!shuttingDown) void shutdown().finally(() => process.exit(1));
  });
  process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
  process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(paths.socketPath, () => resolveListen());
  });
  updateMetadata(paths.metaPath, {
    schema: 1,
    workspace: paths.workspace,
    socketPath: paths.socketPath,
    pid: process.pid,
    childPid: child.pid,
    startedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  await new Promise((resolveExit) => child.once("exit", () => resolveExit()));
  await shutdown();
  return 0;
}
async function callPersistentRuntime(workspacePath, request, timeoutMs = 3e4) {
  const paths = pathsFor(workspacePath);
  const socketPath = resolveRuntimeSocketPath(paths);
  if (!await runtimeAlive(socketPath)) {
    throw new Error(`SCODE runtime is not running for ${paths.workspace}`);
  }
  let normalizedRequest = request;
  if (typeof request?.method === "string" && (/^scode\/(tools|tasks|missions|cabinet)\//.test(request.method) || request.method === "scode/local-worker/run")) {
    const rawParams = request.params && typeof request.params === "object" && !Array.isArray(request.params) ? request.params : {};
    const sessionId = typeof rawParams.sessionId === "string" && rawParams.sessionId.trim() && rawParams.sessionId !== "$runtime" ? rawParams.sessionId.trim() : await ensureExecutionSession(paths);
    normalizedRequest = { ...request, params: { ...rawParams, sessionId } };
  }
  return await socketRequest(socketPath, normalizedRequest, timeoutMs);
}
async function stopPersistentRuntime(workspacePath) {
  const paths = pathsFor(workspacePath);
  const socketPath = resolveRuntimeSocketPath(paths);
  const platform = process.platform === "darwin" || process.platform === "linux" ? process.platform : "win32";
  const descriptor = createServiceDescriptor({
    platform,
    command: process.execPath,
    args: currentCliArgs(["--cwd", paths.workspace, "runtime-server"]),
    name: paths.serviceName
  });
  const wasRunning = await runtimeAlive(socketPath);
  if (wasRunning) {
    await socketRequest(
      socketPath,
      { id: "runtime-stop", method: "scode/runtime/stop", params: {} },
      2e3
    ).catch(() => void 0);
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline && await runtimeAlive(socketPath)) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  try {
    await unregisterService(descriptor, paths.servicePath);
  } catch (error) {
    if (process.platform !== "win32") throw error;
  }
  if (process.platform !== "win32") {
    try {
      unlinkSync(socketPath);
    } catch {
    }
  }
  return wasRunning;
}
export {
  callPersistentRuntime,
  runPersistentRuntimeServer,
  startPersistentRuntime,
  stopPersistentRuntime
};
