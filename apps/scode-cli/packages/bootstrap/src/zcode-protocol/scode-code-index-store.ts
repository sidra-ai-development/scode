import { createHash } from "node:crypto";
import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SourceSnapshot } from "./scode-code-index-types.js";

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs",
]);

const IGNORED_DIRECTORIES = new Set([
  ".git", ".next", ".turbo", "build", "coverage", "dist", "node_modules", "out", "vendor",
]);

export function resolveCodeIndexRoot(workspacePath: string, requestedRoot?: string): string {
  const workspace = path.resolve(workspacePath);
  const root = path.resolve(workspace, requestedRoot?.trim() || ".");
  const relative = path.relative(workspace, root);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("scode/code-index/query root must stay inside the SCODE workspace");
  }
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`scode/code-index/query root not found: ${requestedRoot ?? "."}`);
  }
  return root;
}

export function scanCodeIndexSources(root: string): SourceSnapshot {
  const started = performance.now();
  const files: SourceSnapshot["files"] = [];
  const fingerprint = createHash("sha256");

  const walk = (directory: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
      try {
        const stat = fs.statSync(absolutePath);
        files.push({
          absolutePath,
          relativePath: path.relative(root, absolutePath),
          mtimeMs: stat.mtimeMs,
          size: stat.size,
        });
      } catch {}
    }
  };

  walk(root);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  for (const file of files) {
    fingerprint.update(file.relativePath);
    fingerprint.update("\0");
    fingerprint.update(String(file.size));
    fingerprint.update("\0");
    fingerprint.update(String(Math.trunc(file.mtimeMs)));
    fingerprint.update("\n");
  }

  return {
    files,
    fingerprint: fingerprint.digest("hex"),
    scanMs: roundCodeIndexMs(performance.now() - started),
  };
}

export function codeIndexPath(root: string): string {
  const key = createHash("sha256").update(root).digest("hex").slice(0, 16);
  const directory = path.join(homedir(), ".zcode", "scode-runtime", "code-index");
  fs.mkdirSync(directory, { recursive: true });
  return path.join(directory, `${key}.sqlite`);
}

export function readCodeIndexFingerprint(dbPath: string): string | undefined {
  if (!fs.existsSync(dbPath)) return undefined;
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const row = db.prepare("select value from meta where key = 'fingerprint'").get();
    return row?.value ? String(row.value) : undefined;
  } catch {
    return undefined;
  } finally {
    try {
      db?.close();
    } catch {}
  }
}

export function clampCodeIndexLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 20;
  return Math.min(50, Math.max(1, Math.trunc(value)));
}

export function roundCodeIndexMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}
