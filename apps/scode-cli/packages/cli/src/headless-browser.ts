import type { GlobalOptions } from "./cli-types.js";

export function createCliHeadlessBrowserRuntime(
  _options: Pick<GlobalOptions, "browserExecutable" | "browserUse">,
  _deps?: unknown,
): undefined {
  return undefined;
}
