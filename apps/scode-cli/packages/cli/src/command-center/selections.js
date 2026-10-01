import { formatTime, shortId, shortText } from "./utils.js";
const COMPOSER_SELECTION_PLACEMENT = "composer";
function buildModelSelection(current, models) {
  return {
    emptyMessage: "No selectable models are configured.",
    help: "Type to filter, Up/Down choose, Enter switches model, Esc cancels",
    items: models.map((model) => {
      const id = `${model.ref.providerId}/${model.ref.modelId}`;
      const provider = model.providerLabel ?? model.ref.providerId;
      return {
        command: `/model ${id}`,
        disabledReason: model.disabledReason,
        id,
        keywords: [id, model.label, provider],
        meta: `${provider}${current === id ? " | current" : ""}`,
        primary: model.label,
        secondary: id
      };
    }),
    placement: COMPOSER_SELECTION_PLACEMENT,
    prompt: "Choose a model.",
    title: "Model"
  };
}
function buildEffortSelection(current, efforts) {
  return {
    emptyMessage: "No reasoning efforts are available for the current model.",
    help: "Type to filter, Up/Down choose, Enter switches effort, Esc cancels",
    items: efforts.map((effort) => ({
      command: `/effort ${effort.id}`,
      id: effort.id,
      keywords: [effort.id, effort.label, effort.description ?? ""],
      meta: effort.id === current ? "current" : void 0,
      primary: effort.label,
      secondary: effort.description ?? effort.id
    })),
    placement: COMPOSER_SELECTION_PLACEMENT,
    prompt: "Choose a reasoning effort.",
    title: "Reasoning Effort"
  };
}
function buildContextSelection(status) {
  const modelMaximum = status.modelContextWindow ?? status.contextWindow;
  const presets = [8, 16, 32, 64, 128, 256, 512, 1024].map((kib) => kib * 1024).filter((tokens) => tokens >= 4096 && tokens < modelMaximum);
  if (status.overridden && status.contextWindow < modelMaximum && !presets.includes(status.contextWindow)) {
    presets.push(status.contextWindow);
    presets.sort((a, b) => a - b);
  }
  const items = [
    {
      command: "/context max",
      id: "max",
      meta: status.overridden ? void 0 : "current",
      primary: "Maximum",
      secondary: `${formatTokenCount(modelMaximum)} model limit`
    },
    ...presets.map((tokens) => ({
      command: `/context ${tokens}`,
      id: String(tokens),
      meta: status.overridden && tokens === status.contextWindow ? "current" : void 0,
      primary: formatTokenCount(tokens),
      secondary: "Session context cap"
    })),
    {
      command: "/context",
      id: "custom",
      input: {
        emptyStatus: "Enter a context size such as 96k or 200k.",
        help: "Type a token cap, Enter applies it, Esc cancels",
        placeholder: "e.g. 96k",
        primary: "Custom context size",
        secondary: `Maximum ${formatTokenCount(modelMaximum)}`,
        status: "Enter a custom context size.",
        submitStatus: "Updating context size..."
      },
      primary: "Custom",
      secondary: "Enter a token cap"
    }
  ];
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.meta === "current")
  );
  return {
    emptyMessage: "No context controls are available.",
    filterable: false,
    help: "Up/Down choose, Enter applies, Esc cancels",
    items,
    placement: COMPOSER_SELECTION_PLACEMENT,
    prompt: "Choose the context window.",
    selectedIndex,
    title: "Context Window"
  };
}
function buildMcpSelection(statuses) {
  const items = Object.entries(statuses).sort(([a], [b]) => a.localeCompare(b)).map(([name, status]) => {
    const connected = status.status === "connected" || status.status === "connecting";
    const disabledReason = status.status === "untrusted" ? "This MCP server is not trusted." : status.status === "disabled" ? "MCP is disabled for this server." : void 0;
    const action = connected ? "disconnect" : "connect";
    const toolLabel = status.toolCount === 1 ? "1 tool" : `${status.toolCount} tools`;
    return {
      command: `/mcp ${action} ${name}`,
      ...disabledReason ? { disabledReason } : {},
      id: name,
      keywords: [name, status.status, status.transport, action],
      meta: `${status.status} | ${status.transport} | ${toolLabel}`,
      primary: name,
      secondary: connected ? "Disconnect" : "Connect"
    };
  });
  items.push({
    command: "/mcp add",
    id: "__add_mcp__",
    input: {
      emptyStatus: "Enter a server name, HTTP URL, and optional protocol.",
      help: "Format: name https://server.example/mcp [auto|legacy]",
      placeholder: "name https://server.example/mcp auto",
      primary: "Add MCP Server",
      secondary: "Add an HTTP MCP server",
      status: "Enter server name and URL.",
      submitStatus: "Adding MCP server..."
    },
    keywords: ["add", "new", "mcp", "server"],
    primary: "Add MCP Server",
    secondary: "Configure and connect a new HTTP MCP server"
  });
  return {
    emptyMessage: "No MCP servers are configured.",
    help: "Type to filter, Up/Down choose, Enter connects/disconnects, Esc cancels",
    items,
    placement: COMPOSER_SELECTION_PLACEMENT,
    prompt: "Choose an MCP server.",
    title: "MCP Servers"
  };
}
function buildThemeSelection(current) {
  const themes = [
    { id: "auto", label: "Auto", secondary: "Follow terminal appearance" },
    { id: "dark", label: "Dark", secondary: "SCODE dark master theme" },
    { id: "light", label: "Light", secondary: "Light theme" }
  ];
  return {
    emptyMessage: "No themes are available.",
    filterable: false,
    help: "Up/Down choose, Enter switches theme, Esc cancels",
    items: themes.map((theme) => ({
      command: `/theme ${theme.id}`,
      id: theme.id,
      meta: theme.id === current ? "current" : void 0,
      primary: theme.label,
      secondary: theme.secondary
    })),
    placement: COMPOSER_SELECTION_PLACEMENT,
    prompt: "Choose a theme.",
    title: "Theme"
  };
}
function buildSessionSelection(sessions) {
  return {
    emptyMessage: "No saved sessions found for this directory.",
    help: "Type to filter, Up/Down choose, Enter resumes, Esc cancels",
    items: sessions.map(sessionToSelectionItem),
    placement: COMPOSER_SELECTION_PLACEMENT,
    prompt: "Choose a session to resume.",
    title: "Resume Session"
  };
}
function sessionToSelectionItem(session) {
  const forkMeta = session.parentId ? `fork of ${shortId(session.parentId)}` : "root";
  return {
    command: `/resume ${session.id}`,
    id: session.id,
    keywords: [session.directory, session.title, session.parentId ?? ""],
    meta: `${formatTime(session.updatedAt)} | ${forkMeta}`,
    primary: session.title || session.id,
    secondary: `${shortId(session.id)} | ${session.directory}`
  };
}
function buildCheckpointSelection(action, checkpoints) {
  const verb = action === "fork" ? "fork from" : "rewind to";
  return {
    emptyMessage: "No workspace checkpoints are available yet.",
    help: `Type to filter, Up/Down choose, Enter ${verb}, Esc cancels`,
    items: checkpoints.map((checkpoint) => checkpointToSelectionItem(action, checkpoint)),
    ...action === "rewind" ? { placement: COMPOSER_SELECTION_PLACEMENT } : {},
    prompt: `Choose a checkpoint to ${verb}.`,
    title: action === "fork" ? "Fork From Checkpoint" : "Rewind To Checkpoint"
  };
}
function formatTokenCount(tokens) {
  if (tokens % 1048576 === 0) return `${tokens / 1048576}m`;
  if (tokens % 1024 === 0) return `${tokens / 1024}k`;
  return String(tokens);
}
function checkpointToSelectionItem(action, checkpoint) {
  const fileCount = checkpoint.fileCount === void 0 ? "unknown files" : `${checkpoint.fileCount} file${checkpoint.fileCount === 1 ? "" : "s"}`;
  const compact = checkpoint.coveredByCompact ? ` | compact ${checkpoint.compactBoundaryId ?? "covered"}` : "";
  const preview = checkpoint.preview ?? `message ${shortId(checkpoint.messageId)}`;
  return {
    command: `/${action} ${checkpoint.checkpointId}`,
    id: checkpoint.checkpointId,
    keywords: [
      checkpoint.messageId,
      checkpoint.scope,
      checkpoint.compactBoundaryId ?? "",
      checkpoint.preview ?? ""
    ],
    meta: `${fileCount} | ${formatTime(checkpoint.createdAt)}${compact}`,
    primary: preview,
    secondary: shortId(checkpoint.checkpointId)
  };
}
function buildTargetReplaceSelection(existing, objective) {
  return {
    emptyMessage: "No goal replacement actions are available.",
    help: "Enter replaces the current goal, Esc cancels",
    items: [
      {
        command: `/goal replace ${objective}`,
        id: "replace-goal",
        keywords: [objective, existing.objective],
        meta: `Current: ${shortText(existing.objective, 80)}`,
        primary: "Replace current goal",
        secondary: shortText(objective, 100)
      }
    ],
    prompt: "Replace the current goal?",
    title: "Replace Goal"
  };
}
export {
  buildCheckpointSelection,
  buildContextSelection,
  buildEffortSelection,
  buildMcpSelection,
  buildModelSelection,
  buildSessionSelection,
  buildTargetReplaceSelection,
  buildThemeSelection
};
