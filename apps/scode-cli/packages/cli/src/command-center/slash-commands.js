import { SLASH_COMMAND_HELP_ENTRIES } from "./slash-command-help.js";
import { splitArgs } from "./utils.js";
const SCODE_COMMAND_NAMES = /* @__PURE__ */ new Set([
  "help",
  "compact",
  "context",
  "init",
  "effort",
  "fork",
  "locale",
  "mcp",
  "mode",
  "model",
  "new",
  "resume",
  "rewind",
  "theme"
]);
const SCODE_HELP_ENTRIES = SLASH_COMMAND_HELP_ENTRIES.filter(
  (entry) => SCODE_COMMAND_NAMES.has(entry.name)
);
const AVAILABLE_COMMANDS = SCODE_HELP_ENTRIES.map((entry) => `/${entry.name}`);
function parseSlashCommand(input) {
  if (!input.startsWith("/")) return null;
  const trimmed = input.trim();
  const commandEnd = trimmed.search(/\s/);
  const rawName = (commandEnd === -1 ? trimmed.slice(1) : trimmed.slice(1, commandEnd)).toLowerCase();
  const args = commandEnd === -1 ? "" : trimmed.slice(commandEnd + 1).trim();
  const direct = /* @__PURE__ */ new Set([
    "compact",
    "context",
    "fork",
    "help",
    "init",
    "mcp",
    "mode",
    "model",
    "rewind",
    "theme"
  ]);
  if (direct.has(rawName)) {
    return {
      args,
      name: rawName,
      rawName,
      type: "known"
    };
  }
  if (rawName === "effort" || rawName === "variant") {
    return { args, name: "effort", rawName, type: "known" };
  }
  if (rawName === "locale" || rawName === "language") {
    return { args, name: "locale", rawName, type: "known" };
  }
  if (rawName === "resume" || rawName === "continue") {
    return { args, name: "resume", rawName, type: "known" };
  }
  if (rawName === "new" || rawName === "clear") {
    return { args, name: "new", rawName, type: "known" };
  }
  return { args, rawName, type: "unknown" };
}
function buildManualSkillPrompt(_skillName, task) {
  return task.trim() || "Skills are disabled in SCODE local runtime.";
}
function manualSkillCommandUsage() {
  return "Skills are disabled in SCODE local runtime.";
}
function listSlashCommandSuggestions(_customCommands) {
  return SCODE_HELP_ENTRIES.map((entry) => ({
    ...entry.aliases ? { aliases: entry.aliases } : {},
    name: entry.name,
    summary: entry.summary,
    usage: entry.usage
  }));
}
function formatSlashCommandHelp(args = "", _customCommands) {
  const target = normalizeHelpTarget(args);
  if (target) {
    const entry = findSlashCommandHelpEntry(target);
    if (entry) return formatSlashCommandHelpEntry(entry);
    return `Unknown slash command: /${target}. Available commands: ${AVAILABLE_COMMANDS.join(", ")}.`;
  }
  return [
    "SCODE commands:",
    ...SCODE_HELP_ENTRIES.map((entry) => `- ${entry.usage}: ${entry.summary}`),
    "",
    "Use /help <command> for details."
  ].join("\n");
}
function normalizeHelpTarget(args) {
  const [target] = splitArgs(args);
  const normalized = target?.replace(/^\/+/, "").toLowerCase();
  return normalized && normalized.length > 0 ? normalized : void 0;
}
function findSlashCommandHelpEntry(name) {
  return SCODE_HELP_ENTRIES.find(
    (entry) => entry.name === name || entry.aliases?.includes(name)
  );
}
function formatSlashCommandHelpEntry(entry) {
  const aliasLine = entry.aliases && entry.aliases.length > 0 ? [`Aliases: ${entry.aliases.map((alias) => `/${alias}`).join(", ")}`] : [];
  return [entry.usage, entry.summary, ...aliasLine, ...entry.details].join("\n");
}
export {
  AVAILABLE_COMMANDS,
  buildManualSkillPrompt,
  formatSlashCommandHelp,
  listSlashCommandSuggestions,
  manualSkillCommandUsage,
  parseSlashCommand
};
