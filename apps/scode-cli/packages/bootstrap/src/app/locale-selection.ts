import type { ConfigResult } from "@zcode/adapters/config";

export function getLocaleConfigPath(configResult: ConfigResult): string {
  const project = configResult.sources.project;
  if (project.loaded && project.hasUiLocale && project.uiLocalePath) {
    return project.uiLocalePath;
  }

  return configResult.sources.user.path;
}

export function getThemeConfigPath(configResult: ConfigResult): string {
  const project = configResult.sources.project;
  if (project.loaded && project.hasUiTheme && project.uiThemePath) {
    return project.uiThemePath;
  }

  return configResult.sources.user.path;
}
