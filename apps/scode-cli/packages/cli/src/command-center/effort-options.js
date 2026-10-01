import { getZCodeCopy } from "@zcode/i18n";
async function listAppEffortOptions(app) {
  const levels = app.listThoughtLevels ? await app.listThoughtLevels() : void 0;
  return levels ? thoughtLevelsToEffortOptions(levels, app.getLocale?.()) : void 0;
}
function thoughtLevelsToEffortOptions(levels, locale) {
  const effortCopy = getZCodeCopy(locale).tui.effort;
  return levels.map((level) => ({
    id: level,
    label: effortLabel(level, effortCopy),
    ...effortDescription(level) ? { description: effortDescription(level) } : {}
  }));
}
function effortDisplayLevel(level) {
  if (!level) return "not selected";
  if (level === "enabled") return "High";
  if (level === "disabled") return "Low";
  return level;
}
function effortLabel(level, effortCopy) {
  if (level === "enabled") return "High";
  if (level === "disabled") return "Low";
  return level;
}
function effortDescription(level) {
  if (level === "enabled") return "Thinking enabled";
  if (level === "disabled") return "Thinking minimized";
  return void 0;
}
export {
  effortDisplayLevel,
  listAppEffortOptions,
  thoughtLevelsToEffortOptions
};
