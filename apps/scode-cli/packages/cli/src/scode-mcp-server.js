import { Server } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { scodeMcpTools } from "./scode-mcp-tools.js";
import {
  callPersistentRuntime,
  startPersistentRuntime
} from "./persistent-runtime.js";
const SCODE_MCP_VERSION = "0.1.0";
const DEFAULT_CALL_TIMEOUT_MS = 3e4;
const EXECUTE_CALL_TIMEOUT_MS = 12e4;
const tools = scodeMcpTools;
async function runScodeMcpServer(workspacePath) {
  await startPersistentRuntime(workspacePath);
  const server = new Server(
    { name: "scode", version: SCODE_MCP_VERSION },
    {
      capabilities: { tools: {} },
      instructions: "SCODE is a persistent execution runtime. The calling model is the reasoning layer. Prefer scode_cabinet when several Code Index and native tool operations are already decided; use submit/status/result for longer work."
    }
  );
  server.setRequestHandler("tools/list", async () => ({ tools }));
  server.setRequestHandler("tools/call", async (request) => {
    const args = asRecord(request.params.arguments);
    switch (request.params.name) {
      case "scode_code_index":
        return await callAsMcpResult(
          workspacePath,
          {
            id: requestId(),
            method: "scode/code-index/query",
            params: {
              symbol: requiredString(args.symbol, "symbol"),
              ...optionalString(args.root) ? { root: optionalString(args.root) } : {},
              ...typeof args.limit === "number" ? { limit: args.limit } : {},
              ...typeof args.refresh === "boolean" ? { refresh: args.refresh } : {}
            }
          },
          DEFAULT_CALL_TIMEOUT_MS
        );
      case "scode_cabinet":
        return await callAsMcpResult(
          workspacePath,
          {
            id: requestId(),
            method: "scode/cabinet/execute",
            params: requiredCabinetParams(args)
          },
          EXECUTE_CALL_TIMEOUT_MS
        );
      case "scode_tools_list":
        return await callAsMcpResult(
          workspacePath,
          { id: requestId(), method: "scode/tools/list", params: {} },
          DEFAULT_CALL_TIMEOUT_MS
        );
      case "scode_execute":
        return await callAsMcpResult(
          workspacePath,
          {
            id: requestId(),
            method: "scode/tools/execute",
            params: { toolCalls: requiredToolCalls(args.toolCalls) }
          },
          EXECUTE_CALL_TIMEOUT_MS
        );
      case "scode_submit":
        return await callAsMcpResult(
          workspacePath,
          {
            id: requestId(),
            method: "scode/tasks/submit",
            params: {
              toolCalls: requiredToolCalls(args.toolCalls),
              ...optionalString(args.description) ? { description: optionalString(args.description) } : {}
            }
          },
          DEFAULT_CALL_TIMEOUT_MS
        );
      case "scode_task_status":
        return await taskCall(workspacePath, "scode/tasks/status", args);
      case "scode_task_result":
        return await taskCall(workspacePath, "scode/tasks/result", args);
      case "scode_task_list":
        return await callAsMcpResult(
          workspacePath,
          { id: requestId(), method: "scode/tasks/list", params: {} },
          DEFAULT_CALL_TIMEOUT_MS
        );
      case "scode_task_cancel":
        return await taskCall(workspacePath, "scode/tasks/cancel", args);
      case "scode_mission_start":
        return await callAsMcpResult(
          workspacePath,
          {
            id: requestId(),
            method: "scode/missions/start",
            params: {
              objective: requiredString(args.objective, "objective"),
              phases: requiredArray(args.phases, "phases")
            }
          },
          DEFAULT_CALL_TIMEOUT_MS
        );
      case "scode_mission_continue":
        return await callAsMcpResult(
          workspacePath,
          {
            id: requestId(),
            method: "scode/missions/continue",
            params: {
              missionId: requiredString(args.missionId, "missionId"),
              ...args.phases !== void 0 ? { phases: requiredArray(args.phases, "phases") } : {}
            }
          },
          DEFAULT_CALL_TIMEOUT_MS
        );
      case "scode_mission_status":
        return await missionCall(workspacePath, "scode/missions/status", args);
      case "scode_mission_result":
        return await missionCall(workspacePath, "scode/missions/result", args);
      case "scode_mission_list":
        return await callAsMcpResult(
          workspacePath,
          { id: requestId(), method: "scode/missions/list", params: {} },
          DEFAULT_CALL_TIMEOUT_MS
        );
      case "scode_mission_cancel":
        return await missionCall(workspacePath, "scode/missions/cancel", args);
      case "scode_local_worker_get":
        return await callAsMcpResult(
          workspacePath,
          { id: requestId(), method: "scode/local-worker/get", params: {} },
          DEFAULT_CALL_TIMEOUT_MS
        );
      case "scode_local_worker_set":
        return await callAsMcpResult(
          workspacePath,
          {
            id: requestId(),
            method: "scode/local-worker/set",
            params: {
              mode: requiredLocalWorkerMode(args.mode),
              ...optionalLocalWorkerEffort(args.effort) ? { effort: optionalLocalWorkerEffort(args.effort) } : {},
              ...optionalString(args.modelId) ? { modelId: optionalString(args.modelId) } : {}
            }
          },
          DEFAULT_CALL_TIMEOUT_MS
        );
      case "scode_local_worker_run":
        return await callAsMcpResult(
          workspacePath,
          {
            id: requestId(),
            method: "scode/local-worker/run",
            params: {
              prompt: requiredString(args.prompt, "prompt"),
              ...optionalLocalWorkerEffort(args.effort) ? { effort: optionalLocalWorkerEffort(args.effort) } : {},
              ...optionalString(args.modelId) ? { modelId: optionalString(args.modelId) } : {}
            }
          },
          EXECUTE_CALL_TIMEOUT_MS
        );
      default:
        return mcpError(`Unknown SCODE tool: ${request.params.name}`);
    }
  });
  const handle = serveStdio(() => server, { legacy: "reject" });
  await waitForMcpShutdown();
  await handle.close().catch(() => void 0);
  return 0;
}
async function taskCall(workspacePath, method, args) {
  return await callAsMcpResult(
    workspacePath,
    {
      id: requestId(),
      method,
      params: { taskId: requiredString(args.taskId, "taskId") }
    },
    DEFAULT_CALL_TIMEOUT_MS
  );
}
async function missionCall(workspacePath, method, args) {
  return await callAsMcpResult(
    workspacePath,
    {
      id: requestId(),
      method,
      params: { missionId: requiredString(args.missionId, "missionId") }
    },
    DEFAULT_CALL_TIMEOUT_MS
  );
}
async function callAsMcpResult(workspacePath, request, timeoutMs) {
  try {
    const response = await callPersistentRuntime(workspacePath, request, timeoutMs);
    if (response && typeof response === "object" && "error" in response) {
      const error = response.error;
      return mcpError(formatUnknown(error));
    }
    const result = response && typeof response === "object" && "result" in response ? response.result : response;
    return {
      content: [{ type: "text", text: compactJson(result) }],
      structuredContent: asStructuredContent(result)
    };
  } catch (error) {
    return mcpError(error instanceof Error ? error.message : String(error));
  }
}
function mcpError(message) {
  return {
    content: [{ type: "text", text: message }],
    isError: true
  };
}
function compactJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
function asStructuredContent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  return value;
}
function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}
function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}
function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function requiredArray(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must be a non-empty array`);
  }
  return value;
}
function requiredLocalWorkerMode(value) {
  if (value === "off" || value === "auto" || value === "local") return value;
  throw new Error("mode must be off, auto, or local");
}
function optionalLocalWorkerEffort(value) {
  if (value === void 0 || value === null || value === "") return void 0;
  if (value === "low" || value === "high") return value;
  throw new Error("effort must be low or high");
}
function requiredCabinetParams(args) {
  const codeIndexQueries = args.codeIndexQueries === void 0 ? void 0 : requiredCodeIndexQueries(args.codeIndexQueries);
  const toolCalls = args.toolCalls === void 0 ? void 0 : requiredToolCalls(args.toolCalls);
  if (!codeIndexQueries && !toolCalls) {
    throw new Error("scode_cabinet requires codeIndexQueries and/or toolCalls");
  }
  return {
    ...codeIndexQueries ? { codeIndexQueries } : {},
    ...toolCalls ? { toolCalls } : {}
  };
}
function requiredCodeIndexQueries(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("codeIndexQueries must be a non-empty array");
  }
  return value.map((raw, index) => {
    const query = asRecord(raw);
    return {
      id: requiredString(query.id, `codeIndexQueries[${index}].id`),
      symbol: requiredString(query.symbol, `codeIndexQueries[${index}].symbol`),
      ...optionalString(query.root) ? { root: optionalString(query.root) } : {},
      ...typeof query.limit === "number" ? { limit: query.limit } : {},
      ...typeof query.refresh === "boolean" ? { refresh: query.refresh } : {}
    };
  });
}
function requiredToolCalls(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("toolCalls must be a non-empty array");
  }
  return value.map((raw, index) => {
    const call = asRecord(raw);
    return {
      id: requiredString(call.id, `toolCalls[${index}].id`),
      name: requiredString(call.name, `toolCalls[${index}].name`),
      input: asRecord(call.input)
    };
  });
}
function requestId() {
  return `mcp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function formatUnknown(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
function waitForMcpShutdown() {
  return new Promise((resolveShutdown) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      process.stdin.off("end", finish);
      process.stdin.off("close", finish);
      process.off("SIGINT", finish);
      process.off("SIGTERM", finish);
      resolveShutdown();
    };
    process.stdin.once("end", finish);
    process.stdin.once("close", finish);
    process.once("SIGINT", finish);
    process.once("SIGTERM", finish);
  });
}
export {
  runScodeMcpServer
};
