import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildCodeIndex } from "./scode-code-index-builder.js";
import {
  clampCodeIndexLimit,
  codeIndexPath,
  readCodeIndexFingerprint,
  resolveCodeIndexRoot,
  roundCodeIndexMs,
  scanCodeIndexSources,
} from "./scode-code-index-store.js";
import type { CodeIndexBuildResult, SourceSnapshot } from "./scode-code-index-types.js";

interface OpenIndex {
  db: DatabaseSync;
  dbPath: string;
  fingerprint: string;
  root: string;
}

interface QueryInput {
  root?: string;
  symbol: string;
  limit?: number;
  refresh?: boolean;
}


const openIndexes = new Map<string, OpenIndex>();

export function closeScodeCodeIndexes(): void {
  for (const index of openIndexes.values()) {
    try {
      index.db.close();
    } catch {}
  }
  openIndexes.clear();
}

export function queryScodeCodeIndex(workspacePath: string, input: QueryInput) {
  const symbol = input.symbol.trim();
  if (!symbol) throw new Error("scode/code-index/query requires non-empty symbol");

  const root = resolveCodeIndexRoot(workspacePath, input.root);
  const limit = clampCodeIndexLimit(input.limit);
  const snapshot = scanCodeIndexSources(root);
  const ensured = ensureIndex(root, snapshot, input.refresh === true);
  const started = performance.now();

  const meta = Object.fromEntries(
    ensured.index.db
      .prepare("select key, value from meta")
      .all()
      .map((row) => [String(row.key), String(row.value)]),
  );

  const db = ensured.index.db;
  const occurrenceCount = count(
    db.prepare("select count(*) n from occ where symbol = ?"),
    symbol,
  );
  const declarationCount = count(
    db.prepare("select count(*) n from occ where symbol = ? and role = 'declaration'"),
    symbol,
  );
  const importCount = count(
    db.prepare("select count(*) n from imports where symbol = ?"),
    symbol,
  );
  const callCount = count(
    db.prepare("select count(*) n from occ where symbol = ? and role in ('call', 'construct')"),
    symbol,
  );
  const typeReferenceCount = count(
    db.prepare("select count(*) n from occ where symbol = ? and role = 'type-reference'"),
    symbol,
  );
  const testCount = count(
    db.prepare(
      "select count(*) n from occ o join files f on f.id = o.file_id where o.symbol = ? and f.is_test = 1",
    ),
    symbol,
  );
  const impactedCount = numberValue(
    db
      .prepare(
        `select count(*) n from (
          select distinct f.path path
          from occ o join files f on f.id = o.file_id
          where o.symbol = ?
          union
          select distinct f.path path
          from imports i join files f on f.id = i.file_id
          where i.symbol = ?
        )`,
      )
      .get(symbol, symbol)?.n,
  );

  const declarations = db
    .prepare(
      `select f.path file, f.is_test isTest, o.line, o.col, o.kind
       from occ o join files f on f.id = o.file_id
       where o.symbol = ? and o.role = 'declaration'
       order by f.path, o.line, o.col
       limit ?`,
    )
    .all(symbol, limit)
    .map((row) => ({
      file: String(row.file),
      line: numberValue(row.line),
      col: numberValue(row.col),
      kind: String(row.kind),
      isTest: numberValue(row.isTest) === 1,
      snippet: sourceSnippet(root, String(row.file), numberValue(row.line)),
    }));

  const imports = db
    .prepare(
      `select f.path file, i.line, i.spec, i.target
       from imports i join files f on f.id = i.file_id
       where i.symbol = ?
       order by f.path, i.line
       limit ?`,
    )
    .all(symbol, limit)
    .map((row) => ({
      file: String(row.file),
      line: numberValue(row.line),
      from: String(row.spec),
      ...(row.target ? { target: String(row.target) } : {}),
    }));

  const calls = readOccurrenceRows(
    db,
    symbol,
    "and o.role in ('call', 'construct')",
    limit,
  );
  const typeReferences = readOccurrenceRows(
    db,
    symbol,
    "and o.role = 'type-reference'",
    limit,
  );
  const tests = readOccurrenceRows(db, symbol, "and f.is_test = 1", limit);

  const impactedFiles = db
    .prepare(
      `select path from (
        select distinct f.path path
        from occ o join files f on f.id = o.file_id
        where o.symbol = ?
        union
        select distinct f.path path
        from imports i join files f on f.id = i.file_id
        where i.symbol = ?
      )
      order by path
      limit ?`,
    )
    .all(symbol, symbol, limit)
    .map((row) => String(row.path));

  const builtAt = Date.parse(meta.builtAt ?? "");

  return {
    symbol,
    root: path.relative(path.resolve(workspacePath), root) || ".",
    index: {
      rebuilt: ensured.rebuilt,
      fingerprint: snapshot.fingerprint.slice(0, 16),
      fileCount: numberValue(meta.fileCount),
      symbolCount: numberValue(meta.symbolCount),
      occurrences: numberValue(meta.occurrences),
      parseErrors: numberValue(meta.parseErrors),
      ageMs: Number.isFinite(builtAt) ? Math.max(0, Date.now() - builtAt) : undefined,
      scanMs: snapshot.scanMs,
      ...(ensured.build ? { buildMs: ensured.build.buildMs } : {}),
    },
    queryMs: roundCodeIndexMs(performance.now() - started),
    counts: {
      declarations: declarationCount,
      occurrences: occurrenceCount,
      imports: importCount,
      calls: callCount,
      typeReferences: typeReferenceCount,
      tests: testCount,
      impactedFiles: impactedCount,
    },
    declarations,
    imports,
    calls,
    typeReferences,
    tests,
    impactedFiles,
    truncated: {
      declarations: declarationCount > declarations.length,
      imports: importCount > imports.length,
      calls: callCount > calls.length,
      typeReferences: typeReferenceCount > typeReferences.length,
      tests: testCount > tests.length,
      impactedFiles: impactedCount > impactedFiles.length,
    },
  };
}

function count(statement: ReturnType<DatabaseSync["prepare"]>, symbol: string): number {
  return numberValue(statement.get(symbol)?.n);
}

function readOccurrenceRows(
  db: DatabaseSync,
  symbol: string,
  extraWhere: string,
  limit: number,
) {
  return db
    .prepare(
      `select f.path file, f.is_test isTest, o.line, o.col, o.role
       from occ o join files f on f.id = o.file_id
       where o.symbol = ? ${extraWhere}
       order by f.path, o.line, o.col
       limit ?`,
    )
    .all(symbol, limit)
    .map((row) => ({
      file: String(row.file),
      line: numberValue(row.line),
      col: numberValue(row.col),
      role: String(row.role),
      isTest: numberValue(row.isTest) === 1,
    }));
}


function ensureIndex(root: string, snapshot: SourceSnapshot, forceRefresh: boolean) {
  const cached = openIndexes.get(root);
  if (!forceRefresh && cached?.fingerprint === snapshot.fingerprint) {
    return { index: cached, rebuilt: false, build: undefined as CodeIndexBuildResult | undefined };
  }

  if (cached) {
    try {
      cached.db.close();
    } catch {}
    openIndexes.delete(root);
  }

  const dbPath = codeIndexPath(root);
  if (!forceRefresh && readCodeIndexFingerprint(dbPath) === snapshot.fingerprint) {
    const index = {
      db: new DatabaseSync(dbPath, { readOnly: true }),
      dbPath,
      fingerprint: snapshot.fingerprint,
      root,
    };
    openIndexes.set(root, index);
    return { index, rebuilt: false, build: undefined as CodeIndexBuildResult | undefined };
  }

  const build = buildCodeIndex(root, dbPath, snapshot);
  const index = {
    db: new DatabaseSync(dbPath, { readOnly: true }),
    dbPath,
    fingerprint: snapshot.fingerprint,
    root,
  };
  openIndexes.set(root, index);
  return { index, rebuilt: true, build };
}

function sourceSnippet(root: string, relativeFile: string, line: number) {
  const absolutePath = path.join(root, relativeFile);
  let lines: string[];
  try {
    lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
  } catch {
    return undefined;
  }
  const radius = 5;
  const start = Math.max(1, line - radius);
  const end = Math.min(lines.length, line + radius);
  return {
    start,
    end,
    text: lines
      .slice(start - 1, end)
      .map((value, index) => `${start + index}: ${value}`)
      .join("\n"),
  };
}

function numberValue(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

