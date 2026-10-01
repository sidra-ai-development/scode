import { effortDisplayLevel, thoughtLevelsToEffortOptions } from "../effort-options.js";
import { rememberCurrentModelSelection } from "../model-selection.js";
import { buildEffortSelection } from "../selections.js";
const EFFORT_COMMAND_USAGE = "Use /effort <level>, /variant <level>, or /effort list.";
async function handleEffortCommand(args, deps) {
  const app = await deps.getApp();
  const current = app.getThoughtLevel?.();
  const levels = app.listThoughtLevels ? await app.listThoughtLevels() : void 0;
  const effortOptions = levels ? thoughtLevelsToEffortOptions(levels, app.getLocale?.()) : void 0;
  if (!app.getThoughtLevel || !app.listThoughtLevels || !app.setThoughtLevel || !levels) {
    return {
      mode: deps.getMode?.(),
      response: "Reasoning effort selection is not available in this client."
    };
  }
  if (levels.length === 0) {
    return {
      mode: deps.getMode?.(),
      response: "Reasoning effort selection is not available for the current model.",
      ...effortOptions ? { effortOptions } : {},
      thoughtLevel: current
    };
  }
  const normalizedArgs = args.trim();
  if (normalizedArgs.length === 0) {
    return {
      effortOptions,
      mode: deps.getMode?.(),
      response: "",
      selection: buildEffortSelection(current, effortOptions ?? []),
      thoughtLevel: current
    };
  }
  if (normalizedArgs.toLowerCase() === "list") {
    return {
      effortOptions,
      mode: deps.getMode?.(),
      response: formatEffortList(current, levels),
      thoughtLevel: current
    };
  }
  const requested = resolveRequestedLevel(normalizedArgs, levels) ?? normalizedArgs;
  try {
    const result = await app.setThoughtLevel(requested);
    const persistenceWarning = await rememberCurrentModelSelection(app, deps);
    return {
      effortOptions,
      mode: deps.getMode?.(),
      response: `Reasoning effort switched to ${effortDisplayLevel(result.thoughtLevel)}.${persistenceWarning}`,
      thoughtLevel: result.thoughtLevel
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      effortOptions,
      mode: deps.getMode?.(),
      response: `Unable to switch reasoning effort: ${message}. Available efforts: ${levels.map(effortDisplayLevel).join(", ")}.`,
      thoughtLevel: current
    };
  }
}
function formatEffortList(current, levels) {
  return [
    `Current reasoning effort: ${effortDisplayLevel(current)}.`,
    "Available reasoning efforts:",
    ...levels.map((level) => `- ${effortDisplayLevel(level)}${level === current ? " (current)" : ""}`),
    EFFORT_COMMAND_USAGE
  ].join("\n");
}
function resolveRequestedLevel(args, levels) {
  const requested = args.trim().toLowerCase();
  const alias = requested === "high" ? "enabled" : requested === "low" ? "disabled" : requested === "on" ? "enabled" : requested === "off" ? "disabled" : requested;
  return levels.find((level) => level.toLowerCase() === alias);
}
export {
  handleEffortCommand
};
