import React from "react";
import { activeTuiTheme, resolveTuiThemeMode, setActiveTuiThemeMode } from "./theme/index.js";
import type { TuiOptions } from "./types.js";

export function useTuiThemeSync(options: TuiOptions, theme = options.theme): void {
  const [terminalThemeMode, setTerminalThemeMode] = React.useState(options.initialThemeMode);
  const resolvedThemeMode = resolveTuiThemeMode(theme, terminalThemeMode);
  setActiveTuiThemeMode(resolvedThemeMode);

  React.useEffect(
    () => options.subscribeThemeMode?.(setTerminalThemeMode),
    [options.subscribeThemeMode],
  );

  React.useEffect(() => {
    options.setTerminalBackgroundColor?.(activeTuiTheme(resolvedThemeMode).background);
  }, [options.setTerminalBackgroundColor, resolvedThemeMode]);
}
