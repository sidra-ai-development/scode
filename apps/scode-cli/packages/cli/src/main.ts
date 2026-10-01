import { interceptTuiStderr, isTuiInvocation } from "./tui-stderr.js";
import { interceptKnownRuntimeWarnings } from "./runtime-warnings.js";
import { installStderrConsoleBoundary } from "./protocol-console.js";
import { setCliProcessTitle } from "./process-name.js";
import { applyCliRuntimeEnvSanitization } from "./env.js";
import { ensureSeaRuntimeTools } from "./sea-runtime-tools.js";
import { scheduleCliExitWatchdog } from "./shutdown.js";

void main();

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  setCliProcessTitle();
  // 真实 zcode CLI 进程里仍可能有少量路径直接读取 process.env。
  // 入口先清洗用户 shell 注入的 NODE_ENV、代理和证书变量；网络变量只封存给后续 Bash/tool 子进程恢复。
  applyCliRuntimeEnvSanitization(process.env);
  const isTui = isTuiInvocation(argv);
  if (isTui && process.stdout.isTTY) await ensureWindowsUtf8Console();
  const restoreConsole = isTui ? installStderrConsoleBoundary(process.stderr) : undefined;
  const runtimeWarnings = interceptKnownRuntimeWarnings(process.stderr);
  const tuiStderr = isTui ? interceptTuiStderr(process.stderr) : undefined;
  const stderr = tuiStderr?.passthrough ?? process.stderr;

  try {
    Object.assign(process.env, await ensureSeaRuntimeTools());
    const context = {
      argv,
      stderr,
      stdin: process.stdin,
      stdout: process.stdout,
    };
    const { prepareCliProviderRuntimeEnv } = await import("./provider-runtime-env.js");
    Object.assign(
      process.env,
      await prepareCliProviderRuntimeEnv({
        argv,
        env: process.env,
      }),
    );
    const { run } = await import("./run.js");
    const exitCode = await run(context);

    process.exitCode = exitCode;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`${message}\n`);
    process.exitCode = 1;
  } finally {
    await waitForPendingWarnings();
    if (tuiStderr) tuiStderr.restore();
    runtimeWarnings.restore();
    const exitCode = normalizeProcessExitCode(process.exitCode);
    scheduleCliExitWatchdog({ exitCode });
    restoreConsole?.();

  }
}

async function ensureWindowsUtf8Console(): Promise<void> {
  if (process.platform !== "win32") return;
  try {
    const koffiModule = await import("koffi");
    const koffi = "default" in koffiModule ? koffiModule.default : koffiModule;
    const kernel32 = koffi.load("kernel32.dll");
    const setConsoleOutputCP = kernel32.func("__stdcall", "SetConsoleOutputCP", "bool", ["uint32"]);
    const setConsoleCP = kernel32.func("__stdcall", "SetConsoleCP", "bool", ["uint32"]);
    setConsoleOutputCP(65001);
    setConsoleCP(65001);
  } catch {
    // UTF-8 setup is best-effort; SCODE must still start if console APIs are unavailable.
  }
}

function normalizeProcessExitCode(exitCode: string | number | null | undefined): number {
  if (typeof exitCode === "number" && Number.isInteger(exitCode)) return exitCode;
  if (typeof exitCode === "string") {
    const parsed = Number(exitCode);
    if (Number.isInteger(parsed)) return parsed;
  }
  return 0;
}

function waitForPendingWarnings(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
