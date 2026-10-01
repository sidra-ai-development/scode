import { getZCodeCopy, type UiLocale } from "@zcode/i18n";
import type { TuiEffortOption } from "@zcode/tui";
import type { CommandCenterApp } from "./types.js";

export async function listAppEffortOptions(
  app: CommandCenterApp,
): Promise<TuiEffortOption[] | undefined> {
  const levels = app.listThoughtLevels ? await app.listThoughtLevels() : undefined;
  return levels ? thoughtLevelsToEffortOptions(levels, app.getLocale?.()) : undefined;
}

export function thoughtLevelsToEffortOptions(
  levels: readonly string[],
  locale?: UiLocale,
): TuiEffortOption[] {
  const effortCopy = getZCodeCopy(locale).tui.effort;
  return levels.map((level) => ({
    id: level,
    label: effortLabel(level, effortCopy),
    ...(effortDescription(level) ? { description: effortDescription(level) } : {}),
  }));
}

export function effortDisplayLevel(level: string | undefined): string {
  if (!level) return "not selected";
  if (level === "enabled") return "High";
  if (level === "disabled") return "Low";
  return level;
}

function effortLabel(level: string, effortCopy: { disabled: string; enabled: string }): string {
  if (level === "enabled") return "High";
  if (level === "disabled") return "Low";
  return level;
}

function effortDescription(level: string): string | undefined {
  if (level === "enabled") return "Thinking enabled";
  if (level === "disabled") return "Thinking minimized";
  return undefined;
}
