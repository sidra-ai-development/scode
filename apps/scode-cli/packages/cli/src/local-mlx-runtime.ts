import { spawn, type ChildProcess } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ModelSelection } from "@zcode/shared";

const LOCAL_MLX_PROVIDER_ID = "scode-local-mlx";
const DEFAULT_MLX_PORT = 8081;
const DEFAULT_STARTUP_TIMEOUT_MS = 120_000;

export async function discoverLocalMlxModels(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  // MLX is an Apple Silicon/macOS path. Windows and Linux use Ollama (or another compatible runtime).
  if (process.platform !== "darwin" || process.arch !== "arm64") return [];
  const root = resolve(env.SCODE_MLX_MODELS_DIR?.trim() || join(homedir(), "Models"));
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const models: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name);
    try {
      const files = await readdir(path);
      if (files.includes("config.json") && files.some((name) => name.endsWith(".safetensors"))) {
        models.push(path);
      }
    } catch {
      // Ignore incomplete model directories.
    }
  }
  return models.sort((a, b) => a.localeCompare(b));
}

export class LocalMlxServerController {
  readonly #env: NodeJS.ProcessEnv;
  readonly #port: number;
  #child: ChildProcess | undefined;
  #activeModel: string | undefined;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.#env = env;
    const configuredPort = Number(env.SCODE_MLX_PORT);
    this.#port =
      Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : DEFAULT_MLX_PORT;
  }

  async ensureSelection(selection: ModelSelection | undefined): Promise<void> {
    if (!selection || selection.providerId !== LOCAL_MLX_PROVIDER_ID) {
      await this.#stopOwnedServer();
      return;
    }
    await this.switchModel(selection.modelId);
  }

  async switchModel(modelId: string): Promise<void> {
    const requested = resolveModelPath(modelId);
    if (this.#activeModel === requested && this.#child && this.#child.exitCode === null) return;

    const liveModel = await this.#readServerModel();
    if (liveModel && samePath(liveModel, requested)) {
      this.#activeModel = requested;
      return;
    }
    if (liveModel && !this.#child) {
      throw new Error(
        `MLX port ${this.#port} is owned by another process running ${liveModel}. Stop that server before switching models.`,
      );
    }

    await this.#stopOwnedServer();
    await this.#startOwnedServer(requested);
  }

  async close(): Promise<void> {
    await this.#stopOwnedServer();
  }

  async #startOwnedServer(modelPath: string): Promise<void> {
    const executable = await resolveMlxServerExecutable(this.#env);
    const child = spawn(
      executable,
      [
        "--model",
        modelPath,
        "--host",
        "127.0.0.1",
        "--port",
        String(this.#port),
        "--log-level",
        "ERROR",
      ],
      {
        detached: process.platform !== "win32",
        env: this.#env,
        stdio: "ignore",
      },
    );
    this.#child = child;
    child.unref();

    const timeout = positiveInt(this.#env.SCODE_MLX_STARTUP_TIMEOUT_MS) ?? DEFAULT_STARTUP_TIMEOUT_MS;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        this.#child = undefined;
        throw new Error("MLX server exited before becoming ready.");
      }
      const liveModel = await this.#readServerModel();
      if (liveModel && samePath(liveModel, modelPath)) {
        this.#activeModel = modelPath;
        return;
      }
      await delay(200);
    }

    await this.#stopOwnedServer();
    throw new Error(`MLX server did not become ready within ${timeout}ms.`);
  }

  async #stopOwnedServer(): Promise<void> {
    const child = this.#child;
    this.#child = undefined;
    this.#activeModel = undefined;
    if (!child || child.exitCode !== null || child.pid === undefined) return;

    try {
      if (process.platform === "win32") child.kill("SIGTERM");
      else process.kill(-child.pid, "SIGTERM");
    } catch {
      return;
    }

    if (await waitForExit(child, 5_000)) return;
    try {
      if (process.platform === "win32") child.kill("SIGKILL");
      else process.kill(-child.pid, "SIGKILL");
    } catch {
      // Process already exited.
    }
  }

  async #readServerModel(): Promise<string | undefined> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 750);
    timeout.unref?.();
    try {
      const response = await fetch(`http://127.0.0.1:${this.#port}/v1/models`, {
        signal: controller.signal,
      });
      if (!response.ok) return undefined;
      const body = (await response.json()) as { data?: Array<{ id?: unknown }> };
      const id = body.data?.find((item) => typeof item.id === "string")?.id;
      return typeof id === "string" ? id : undefined;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function resolveMlxServerExecutable(env: NodeJS.ProcessEnv): Promise<string> {
  const explicit = env.SCODE_MLX_SERVER_BIN?.trim();
  if (explicit) return explicit;
  const local = join(homedir(), ".local", "bin", "mlx_lm.server");
  try {
    await access(local);
    return local;
  } catch {
    return "mlx_lm.server";
  }
}

function resolveModelPath(modelId: string): string {
  return resolve(modelId.replace(/^~(?=\/)/, homedir()));
}

function samePath(left: string, right: string): boolean {
  return resolveModelPath(left) === resolveModelPath(right);
}

function positiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolveWait) => {
    const timer = setTimeout(() => {
      cleanup();
      resolveWait(false);
    }, timeoutMs);
    timer.unref?.();
    const onExit = () => {
      cleanup();
      resolveWait(true);
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off("exit", onExit);
    };
    child.once("exit", onExit);
  });
}
