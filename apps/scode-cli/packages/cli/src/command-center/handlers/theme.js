import { buildThemeSelection } from "../selections.js";
const THEMES = ["auto", "dark", "light"];
async function handleThemeCommand(args, deps) {
  const app = await deps.getApp();
  const current = app.getTheme?.() ?? "auto";
  const normalizedArgs = args.trim().toLowerCase();
  if (normalizedArgs.length === 0) {
    return {
      mode: deps.getMode?.(),
      response: "",
      selection: buildThemeSelection(current),
      theme: current
    };
  }
  if (normalizedArgs === "list" || normalizedArgs === "status") {
    return {
      mode: deps.getMode?.(),
      response: [
        `Current theme: ${current}.`,
        `Available themes: ${THEMES.join(", ")}.`,
        "Use /theme <theme> to switch and persist the UI theme."
      ].join("\n"),
      theme: current
    };
  }
  if (!isThemePreference(normalizedArgs)) {
    return {
      mode: deps.getMode?.(),
      response: `Unsupported theme: ${args}. Available themes: ${THEMES.join(", ")}.`,
      theme: current
    };
  }
  const setTheme = deps.setTheme ?? app.setTheme?.bind(app);
  if (!setTheme) {
    return {
      mode: deps.getMode?.(),
      response: "Theme switching is not available in this client.",
      theme: current
    };
  }
  try {
    const result = await setTheme(normalizedArgs);
    return {
      mode: deps.getMode?.(),
      response: `Theme switched to ${result.theme}.${result.configPath ? `
Config: ${result.configPath}` : ""}`,
      theme: result.theme
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      mode: deps.getMode?.(),
      response: `Unable to switch theme: ${message}`,
      theme: current
    };
  }
}
function isThemePreference(value) {
  return THEMES.includes(value);
}
export {
  handleThemeCommand
};
