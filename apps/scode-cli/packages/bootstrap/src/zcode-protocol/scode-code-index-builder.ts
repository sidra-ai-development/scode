import { parse } from "@babel/parser";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { roundCodeIndexMs } from "./scode-code-index-store.js";
import type { CodeIndexBuildResult, SourceSnapshot } from "./scode-code-index-types.js";

interface AstPosition {
  line: number;
  column: number;
}

interface AstNode {
  type: string;
  loc?: { start: AstPosition };
  [key: string]: unknown;
}

export function buildCodeIndex(root: string, dbPath: string, snapshot: SourceSnapshot): CodeIndexBuildResult {
  const started = performance.now();
  const tempPath = `${dbPath}.${process.pid}.${Date.now()}.tmp`;
  fs.rmSync(tempPath, { force: true });
  const db = new DatabaseSync(tempPath);
  let completed = false;

  try {
    db.exec(`
      pragma journal_mode=off;
      pragma synchronous=off;
      pragma temp_store=memory;
      create table meta(key text primary key, value text not null);
      create table files(id integer primary key, path text unique not null, is_test integer not null);
      create table occ(symbol text not null, file_id integer not null, line integer not null, col integer not null, role text not null, kind text not null);
      create table imports(symbol text not null, file_id integer not null, line integer not null, spec text not null, target text);
    `);

    const insertMeta = db.prepare("insert into meta(key, value) values(?, ?)");
    const insertFile = db.prepare("insert into files(path, is_test) values(?, ?)");
    const insertOccurrence = db.prepare(
      "insert into occ(symbol, file_id, line, col, role, kind) values(?, ?, ?, ?, ?, ?)",
    );
    const insertImport = db.prepare(
      "insert into imports(symbol, file_id, line, spec, target) values(?, ?, ?, ?, ?)",
    );

    let parseErrors = 0;
    db.exec("begin");
    insertMeta.run("projectRoot", root);
    insertMeta.run("fingerprint", snapshot.fingerprint);
    insertMeta.run("builtAt", new Date().toISOString());
    insertMeta.run("fileCount", String(snapshot.files.length));

    for (const file of snapshot.files) {
      const isTest = /\.(test|spec)\.[cm]?[jt]sx?$/.test(file.relativePath) ? 1 : 0;
      const fileInfo = insertFile.run(file.relativePath, isTest);
      const fileId = Number(fileInfo.lastInsertRowid);

      let text: string;
      try {
        text = fs.readFileSync(file.absolutePath, "utf8");
      } catch {
        continue;
      }

      let program: AstNode;
      try {
        const parsed = parse(text, {
          sourceType: "unambiguous",
          errorRecovery: true,
          plugins: parserPlugins(file.absolutePath),
        });
        parseErrors += parsed.errors?.length ?? 0;
        program = parsed.program as unknown as AstNode;
      } catch {
        parseErrors += 1;
        continue;
      }

      walkAst(program, undefined, undefined, (node, parent, parentKey) => {
        if (node.type === "ImportDeclaration") {
          indexImportDeclaration(root, file.absolutePath, fileId, node, insertImport);
        }

        const declaration = declarationIdentity(node);
        if (declaration) {
          const position = startPosition(declaration.name);
          if (position) {
            insertOccurrence.run(
              declaration.name.name,
              fileId,
              position.line,
              position.col,
              "declaration",
              declaration.kind,
            );
          }
        }

        if (node.type !== "Identifier" || typeof node.name !== "string") return;
        if (isDeclarationIdentifier(node, parent, parentKey)) return;
        if (isImportIdentifier(parent)) return;
        if (isNonReferencePropertyKey(node, parent, parentKey)) return;

        const position = startPosition(node);
        if (!position) return;
        insertOccurrence.run(
          node.name,
          fileId,
          position.line,
          position.col,
          referenceRole(parent, parentKey),
          "identifier",
        );
      });
    }

    const symbolCount = numberValue(
      db.prepare("select count(distinct symbol) n from occ").get()?.n,
    );
    const occurrences = numberValue(db.prepare("select count(*) n from occ").get()?.n);
    insertMeta.run("symbolCount", String(symbolCount));
    insertMeta.run("occurrences", String(occurrences));
    insertMeta.run("parseErrors", String(parseErrors));
    db.exec(
      "commit; create index occ_symbol on occ(symbol); create index imports_symbol on imports(symbol); create index files_path on files(path);",
    );
    completed = true;

    return {
      buildMs: roundCodeIndexMs(performance.now() - started),
      fileCount: snapshot.files.length,
      symbolCount,
      occurrences,
      parseErrors,
    };
  } catch (error) {
    try {
      db.exec("rollback");
    } catch {}
    throw error;
  } finally {
    db.close();
    if (completed) {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.renameSync(tempPath, dbPath);
    } else {
      fs.rmSync(tempPath, { force: true });
    }
  }
}

function parserPlugins(filePath: string) {
  const extension = path.extname(filePath);
  const plugins: Array<
    | "typescript"
    | "jsx"
    | "decorators-legacy"
    | "importAttributes"
    | "explicitResourceManagement"
  > = ["decorators-legacy", "importAttributes", "explicitResourceManagement"];
  if (extension === ".ts" || extension === ".tsx" || extension === ".mts" || extension === ".cts") {
    plugins.push("typescript");
  }
  if (extension === ".tsx" || extension === ".jsx") plugins.push("jsx");
  return plugins;
}

function walkAst(
  node: AstNode,
  parent: AstNode | undefined,
  parentKey: string | undefined,
  visit: (node: AstNode, parent: AstNode | undefined, parentKey: string | undefined) => void,
): void {
  visit(node, parent, parentKey);
  for (const [key, value] of Object.entries(node)) {
    if (
      key === "loc" ||
      key === "start" ||
      key === "end" ||
      key === "extra" ||
      key === "errors" ||
      key.endsWith("Comments")
    ) {
      continue;
    }
    if (isAstNode(value)) {
      walkAst(value, node, key, visit);
      continue;
    }
    if (!Array.isArray(value)) continue;
    for (const child of value) {
      if (isAstNode(child)) walkAst(child, node, key, visit);
    }
  }
}

function isAstNode(value: unknown): value is AstNode {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof (value as { type?: unknown }).type === "string",
  );
}

function declarationIdentity(
  node: AstNode,
): { name: AstNode & { name: string }; kind: string } | undefined {
  let name: unknown;
  let kind: string | undefined;

  switch (node.type) {
    case "ClassDeclaration":
      name = node.id;
      kind = "class";
      break;
    case "FunctionDeclaration":
    case "TSDeclareFunction":
      name = node.id;
      kind = "function";
      break;
    case "TSInterfaceDeclaration":
      name = node.id;
      kind = "interface";
      break;
    case "TSTypeAliasDeclaration":
      name = node.id;
      kind = "type";
      break;
    case "TSEnumDeclaration":
      name = node.id;
      kind = "enum";
      break;
    case "VariableDeclarator":
      name = node.id;
      kind = "variable";
      break;
    case "ClassMethod":
    case "ObjectMethod":
      name = node.key;
      kind = "method";
      break;
    default:
      return undefined;
  }

  if (!isAstNode(name) || name.type !== "Identifier" || typeof name.name !== "string") {
    return undefined;
  }
  return { name: name as AstNode & { name: string }, kind };
}

function isDeclarationIdentifier(
  node: AstNode,
  parent: AstNode | undefined,
  parentKey: string | undefined,
): boolean {
  if (!parent) return false;
  if (
    parentKey === "id" &&
    (parent.type === "ClassDeclaration" ||
      parent.type === "FunctionDeclaration" ||
      parent.type === "TSDeclareFunction" ||
      parent.type === "TSInterfaceDeclaration" ||
      parent.type === "TSTypeAliasDeclaration" ||
      parent.type === "TSEnumDeclaration" ||
      parent.type === "VariableDeclarator")
  ) {
    return true;
  }
  return (
    parentKey === "key" &&
    (parent.type === "ClassMethod" || parent.type === "ObjectMethod") &&
    parent.computed !== true
  );
}

function isImportIdentifier(parent: AstNode | undefined): boolean {
  return Boolean(
    parent &&
      (parent.type === "ImportSpecifier" ||
        parent.type === "ImportDefaultSpecifier" ||
        parent.type === "ImportNamespaceSpecifier"),
  );
}

function isNonReferencePropertyKey(
  node: AstNode,
  parent: AstNode | undefined,
  parentKey: string | undefined,
): boolean {
  if (!parent || parentKey !== "key" || parent.computed === true) return false;
  if (
    parent.type === "ObjectProperty" ||
    parent.type === "ClassProperty" ||
    parent.type === "ClassPrivateProperty" ||
    parent.type === "TSPropertySignature" ||
    parent.type === "TSMethodSignature"
  ) {
    return parent.shorthand !== true || parent.value !== node;
  }
  return false;
}

function referenceRole(parent: AstNode | undefined, parentKey: string | undefined): string {
  if (!parent) return "reference";
  if (parentKey === "callee" && parent.type === "CallExpression") return "call";
  if (parentKey === "callee" && parent.type === "NewExpression") return "construct";
  if (
    (parentKey === "typeName" && parent.type === "TSTypeReference") ||
    (parentKey === "expression" &&
      (parent.type === "TSExpressionWithTypeArguments" ||
        parent.type === "TSInterfaceHeritage" ||
        parent.type === "TSClassImplements"))
  ) {
    return "type-reference";
  }
  return "reference";
}

function indexImportDeclaration(
  root: string,
  fromFile: string,
  fileId: number,
  node: AstNode,
  insertImport: ReturnType<DatabaseSync["prepare"]>,
): void {
  const source = node.source;
  if (!isAstNode(source) || typeof source.value !== "string") return;
  const specifier = source.value;
  const target = resolveRelativeImport(root, fromFile, specifier);
  const line = startPosition(node)?.line ?? 1;
  const specifiers = Array.isArray(node.specifiers) ? node.specifiers : [];

  for (const rawSpecifier of specifiers) {
    if (!isAstNode(rawSpecifier)) continue;
    if (rawSpecifier.type === "ImportSpecifier") {
      const imported = identifierName(rawSpecifier.imported);
      const local = identifierName(rawSpecifier.local);
      if (imported) insertImport.run(imported, fileId, line, specifier, target ?? null);
      if (local && local !== imported) {
        insertImport.run(local, fileId, line, specifier, target ?? null);
      }
      continue;
    }
    if (
      rawSpecifier.type === "ImportDefaultSpecifier" ||
      rawSpecifier.type === "ImportNamespaceSpecifier"
    ) {
      const local = identifierName(rawSpecifier.local);
      if (local) insertImport.run(local, fileId, line, specifier, target ?? null);
    }
  }
}

function identifierName(value: unknown): string | undefined {
  if (!isAstNode(value)) return undefined;
  if (value.type === "Identifier" && typeof value.name === "string") return value.name;
  if (value.type === "StringLiteral" && typeof value.value === "string") return value.value;
  return undefined;
}

function startPosition(node: AstNode): { line: number; col: number } | undefined {
  const start = node.loc?.start;
  if (!start) return undefined;
  return { line: start.line, col: start.column + 1 };
}

function resolveRelativeImport(
  root: string,
  fromFile: string,
  specifier: string,
): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const stripped = base.replace(/\.(js|mjs|cjs)$/, "");
  const candidates = [
    base,
    `${stripped}.ts`,
    `${stripped}.tsx`,
    `${stripped}.js`,
    `${stripped}.jsx`,
    path.join(stripped, "index.ts"),
    path.join(stripped, "index.tsx"),
    path.join(stripped, "index.js"),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return path.relative(root, candidate);
    } catch {}
  }
  return path.relative(root, base);
}


function numberValue(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}
