const toolCallSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "input"],
  properties: {
    id: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    input: { type: "object" }
  }
};
const codeIndexQuerySchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "symbol"],
  properties: {
    id: { type: "string", minLength: 1 },
    symbol: { type: "string", minLength: 1 },
    root: { type: "string" },
    limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
    refresh: { type: "boolean", default: false }
  }
};
const phaseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    toolCalls: {
      type: "array",
      maxItems: 64,
      items: toolCallSchema
    },
    checkpoint: { type: "boolean" },
    checkpointReason: { type: "string", minLength: 1 },
    onFailure: { type: "string", enum: ["pause", "fail"], default: "pause" }
  }
};
const scodeMcpTools = [
  {
    name: "scode_code_index",
    description: "Query SCODE's persistent semantic code index for an exact identifier. Returns declarations, imports, calls, type references, tests, and impacted files without model inference.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["symbol"],
      properties: {
        symbol: { type: "string", minLength: 1 },
        root: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        refresh: { type: "boolean", default: false }
      }
    },
    annotations: readOnlyAnnotations()
  },
  {
    name: "scode_cabinet",
    description: "Run one mixed SCODE execution-cabinet request containing Code Index queries plus native tool calls. Code Index runs inside the persistent runtime and native calls use SCODE's scheduler and ToolExecutor. Prefer this surface when ChatGPT can decide several local operations up front.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        codeIndexQueries: {
          type: "array",
          minItems: 1,
          maxItems: 32,
          items: codeIndexQuerySchema
        },
        toolCalls: {
          type: "array",
          minItems: 1,
          maxItems: 64,
          items: toolCallSchema
        }
      }
    },
    annotations: mutatingAnnotations()
  },
  {
    name: "scode_tools_list",
    description: "List SCODE native execution tools and any optional SIDRA OS capabilities currently available.",
    inputSchema: emptySchema(),
    annotations: readOnlyAnnotations()
  },
  {
    name: "scode_execute",
    description: "Execute already-decided tool calls through SCODE's native scheduler and ToolExecutor.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["toolCalls"],
      properties: {
        toolCalls: {
          type: "array",
          minItems: 1,
          maxItems: 64,
          items: toolCallSchema
        }
      }
    },
    annotations: mutatingAnnotations()
  },
  {
    name: "scode_submit",
    description: "Submit a durable background execution task and return a task ID immediately.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["toolCalls"],
      properties: {
        description: { type: "string", minLength: 1, maxLength: 500 },
        toolCalls: {
          type: "array",
          minItems: 1,
          maxItems: 64,
          items: toolCallSchema
        }
      }
    },
    annotations: mutatingAnnotations()
  },
  taskTool("scode_task_status", "Read the status of a submitted SCODE task.", true),
  taskTool("scode_task_result", "Read the structured result of a SCODE task.", true),
  {
    name: "scode_task_list",
    description: "List tasks known to the persistent SCODE execution session.",
    inputSchema: emptySchema(),
    annotations: readOnlyAnnotations()
  },
  taskTool("scode_task_cancel", "Request cancellation of a running SCODE task.", false),
  {
    name: "scode_mission_start",
    description: "Start a durable SCODE coding mission from an externally reasoned phase plan. SCODE executes internal tools and pauses at explicit checkpoints or unexpected failures.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["objective", "phases"],
      properties: {
        objective: { type: "string", minLength: 1, maxLength: 4e3 },
        phases: {
          type: "array",
          minItems: 1,
          maxItems: 128,
          items: phaseSchema
        }
      }
    },
    annotations: mutatingAnnotations()
  },
  {
    name: "scode_mission_continue",
    description: "Continue the same durable SCODE mission after ChatGPT reasoning. Optional new phases may be appended before resuming.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["missionId"],
      properties: {
        missionId: { type: "string", minLength: 1 },
        phases: {
          type: "array",
          minItems: 1,
          maxItems: 128,
          items: phaseSchema
        }
      }
    },
    annotations: mutatingAnnotations()
  },
  missionTool(
    "scode_mission_status",
    "Read current durable mission status and checkpoint reason.",
    true
  ),
  missionTool(
    "scode_mission_result",
    "Read mission status plus compact durable phase execution results.",
    true
  ),
  {
    name: "scode_mission_list",
    description: "List durable SCODE missions in the current execution session.",
    inputSchema: emptySchema(),
    annotations: readOnlyAnnotations()
  },
  missionTool("scode_mission_cancel", "Request cancellation of a running SCODE mission.", false),
  {
    name: "scode_local_worker_get",
    description: "Read optional local MLX worker mode and discovered local models. Local inference is OFF by default.",
    inputSchema: emptySchema(),
    annotations: readOnlyAnnotations()
  },
  {
    name: "scode_local_worker_set",
    description: "Set optional local worker mode: off, auto, or local. An explicit discovered model and Low/High effort may be selected.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["mode"],
      properties: {
        mode: { type: "string", enum: ["off", "auto", "local"] },
        effort: { type: "string", enum: ["low", "high"] },
        modelId: { type: "string", minLength: 1 }
      }
    },
    annotations: mutatingAnnotations()
  },
  {
    name: "scode_local_worker_run",
    description: "Explicitly delegate one bounded prompt to the optional local MLX worker. Fails when worker mode is OFF. Optional effort overrides the saved Low/High worker effort for this turn.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["prompt"],
      properties: {
        prompt: { type: "string", minLength: 1, maxLength: 32e3 },
        effort: { type: "string", enum: ["low", "high"] },
        modelId: { type: "string", minLength: 1 }
      }
    },
    annotations: mutatingAnnotations()
  }
];
function emptySchema() {
  return { type: "object", additionalProperties: false, properties: {} };
}
function taskTool(name, description, readOnly) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["taskId"],
      properties: { taskId: { type: "string", minLength: 1 } }
    },
    annotations: readOnly ? readOnlyAnnotations() : mutatingAnnotations()
  };
}
function missionTool(name, description, readOnly) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["missionId"],
      properties: { missionId: { type: "string", minLength: 1 } }
    },
    annotations: readOnly ? readOnlyAnnotations() : mutatingAnnotations()
  };
}
function readOnlyAnnotations() {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };
}
function mutatingAnnotations() {
  return {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true
  };
}
export {
  scodeMcpTools
};
