import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { collectSeaTuiAssets, seaTuiAssetPrefix } from "../apps/scode-cli/packages/cli/scripts/sea-tui-assets.mjs";
import { supportedTargets } from "../apps/scode-cli/packages/cli/scripts/sea-targets.mjs";

const root = resolve(import.meta.dirname, "..");
const version = "1.0.2";
const outDir = resolve(root, "dist", "scode-npm");
const workDir = resolve(outDir, ".work");
const packageRoot = resolve(workDir, "package");
const cliDist = resolve(root, "apps/scode-cli/packages/cli/dist");

const ensureFile = async (p) => {
  const s = await stat(p).catch(() => null);
  if (!s?.isFile()) throw new Error("Missing required file: " + p);
};

await ensureFile(resolve(cliDist, "scode.cjs"));
await rm(workDir, { recursive: true, force: true });
await mkdir(resolve(packageRoot, "dist"), { recursive: true });

await cp(resolve(cliDist, "scode.cjs"), resolve(packageRoot, "dist/scode.cjs"));
await cp(resolve(cliDist, "provider"), resolve(packageRoot, "dist/provider"), { recursive: true });
for (const name of ["THIRD-PARTY-NOTICES.md"]) {
  const src = resolve(cliDist, name);
  const s = await stat(src).catch(() => null);
  if (s?.isFile()) await cp(src, resolve(packageRoot, name));
}

const copied = new Map();
for (const target of supportedTargets) {
  const staging = resolve(workDir, "tui-" + target);
  const { assets, manifest } = await collectSeaTuiAssets({
    root: resolve(root, "apps/scode-cli"),
    stagingDirectory: staging,
    target,
  });
  for (const file of manifest.files) {
    const previous = copied.get(file.path);
    if (previous && previous !== file.sha256) {
      throw new Error("Conflicting runtime asset: " + file.path + " (" + target + ")");
    }
    if (previous) continue;
    const src = assets[seaTuiAssetPrefix + file.path];
    const dst = resolve(packageRoot, file.path);
    await mkdir(dirname(dst), { recursive: true });
    await cp(src, dst);
    copied.set(file.path, file.sha256);
  }
  await rm(staging, { recursive: true, force: true });
}

const playwrightSrc = resolve(root, "node_modules/playwright-core");
const playwrightStat = await stat(playwrightSrc).catch(() => null);
if (playwrightStat?.isDirectory()) {
  await cp(playwrightSrc, resolve(packageRoot, "node_modules/playwright-core"), {
    recursive: true,
    dereference: true,
  });
}

const packageNames = [];
const nm = resolve(packageRoot, "node_modules");
const fs = await import("node:fs/promises");

// Runtime binaries are already staged. Strip install/build lifecycle scripts from bundled
// dependencies so npm never tries to rebuild native modules on the user's machine.
const sanitizePackageScripts = async (directory) => {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = resolve(directory, entry.name);
    if (entry.name.startsWith("@")) {
      await sanitizePackageScripts(child);
      continue;
    }
    const pj = resolve(child, "package.json");
    try {
      const meta = JSON.parse(await readFile(pj, "utf8"));
      if (meta.scripts) {
        delete meta.scripts;
        await writeFile(pj, JSON.stringify(meta, null, 2) + "\n");
      }
    } catch {}
  }
};
await sanitizePackageScripts(nm);
for (const entry of await fs.readdir(nm, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (entry.name.startsWith("@")) {
    const scopeDir = resolve(nm, entry.name);
    for (const child of await fs.readdir(scopeDir, { withFileTypes: true })) {
      if (child.isDirectory()) packageNames.push(entry.name + "/" + child.name);
    }
  } else {
    packageNames.push(entry.name);
  }
}

const dependencies = {};
for (const name of packageNames.sort()) {
  const pj = resolve(nm, ...name.split("/"), "package.json");
  try {
    const meta = JSON.parse(await readFile(pj, "utf8"));
    dependencies[name] = meta.version || "*";
  } catch {
    dependencies[name] = "*";
  }
}

await writeFile(resolve(packageRoot, "package.json"), JSON.stringify({
  name: "@sidra-ai/scode",
  version,
  description: "SCODE local coding agent CLI",
  license: "Apache-2.0",
  type: "commonjs",
  bin: { scode: "dist/scode.cjs" },
  engines: { node: ">=24.0.0" },
  dependencies,
  bundledDependencies: Object.keys(dependencies),
  files: ["dist", "node_modules", "THIRD-PARTY-NOTICES.md"]
}, null, 2) + "\n");

await writeFile(resolve(packageRoot, "README.md"), "# SCODE\n\nLocal coding agent CLI by SIDRA.\n");

console.log(packageRoot);
