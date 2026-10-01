// ============================================================
// Environment Info Section Builder
// ============================================================

import type { ContextSection, EnvInfo } from "../types.js";
import { estimateTokens } from "../utils.js";

const ENVIRONMENT_HEADING = "# Environment";
const CLEAN_GIT_STATUS = "(clean)";
const DIRTY_GIT_STATUS = "(dirty)";
const UNKNOWN_GIT_STATUS = "(unknown)";

export function buildEnvInfoSection(envInfo: EnvInfo): ContextSection {
  const content = buildEnvInfoContent(envInfo);

  return {
    name: "Environment Info",
    source: "env_info",
    injectionTarget: "system",
    cacheHint: "dynamic",
    chars: content.length,
    tokens: estimateTokens(content),
    content,
    preview: content.slice(0, 100),
  };
}

export function buildGitSystemContextSection(envInfo: EnvInfo): ContextSection | null {
  if (!isEnvInfoGitRepository(envInfo)) {
    return null;
  }

  const content = buildGitSystemContextContent(envInfo);

  return {
    name: "System Context",
    source: "system_context",
    injectionTarget: "system",
    cacheHint: "dynamic",
    chars: content.length,
    tokens: estimateTokens(content),
    content,
    preview: content.slice(0, 100),
  };
}

function buildEnvInfoContent(info: EnvInfo): string {
  return [
    ENVIRONMENT_HEADING,
    `cwd: ${info.cwd}`,
    `git: ${isEnvInfoGitRepository(info) ? "yes" : "no"}`,
    `platform: ${info.platform}`,
    `shell: ${info.shell}`,
  ].join("\n");
}

function buildGitSystemContextContent(info: EnvInfo): string {
  const lines = ["# Git snapshot (conversation start)"];

  if (info.gitBranch) {
    lines.push(`branch: ${info.gitBranch}`);
  }

  lines.push(`status: ${formatGitStatus(info)}`);
  return lines.join("\n");
}

export function isEnvInfoGitRepository(info: EnvInfo): boolean {
  return (
    info.isGitRepository ??
    (info.gitStatus !== undefined ? info.gitStatus !== "not_repo" : Boolean(info.gitBranch))
  );
}

function formatGitStatus(info: EnvInfo): string {
  if (info.gitStatusLines && info.gitStatusLines.length > 0) {
    return `dirty (${info.gitStatusLines.length} changed paths)`;
  }
  if (info.gitStatus === "dirty") {
    return DIRTY_GIT_STATUS;
  }
  if (info.gitStatus === "clean") {
    return CLEAN_GIT_STATUS;
  }
  return UNKNOWN_GIT_STATUS;
}
