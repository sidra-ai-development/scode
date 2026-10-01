import { extractDisallowedToolsArgs, parseGlobalArgs } from "./arguments.js";
import { createNodeLoggerFactory } from "@zcode/adapters";
import { getRuntimeInfo } from "@zcode/core";
import { color, formatJson, supportsColor } from "@zcode/core";
import { getZCodeCopy, isUiLocale } from "@zcode/i18n";
import { applyCliRuntimeEnvSanitization, loadCliDotenv, prepareCliRuntimeEnv, shouldLoadCliDotenvForProtocolServer, } from "./env.js";
import { formatCliHelp } from "./help.js";
import { detectCliLocale } from "./locale.js";
import { loadBootstrapModule } from "./bootstrap-loader.js";
import { resolveCliCwd } from "./cwd.js";
import { CLI_COMMAND_NAME, CLI_PROCESS_NAME } from "./process-name.js";
import { runPrompt } from "./prompt-command.js";
import { runTuiCommand } from "./tui-command.js";
import { runExternalToolCommand } from "./external-tool-command.js";
import { runScodeMcpServer } from "./scode-mcp-server.js";
import {
  callPersistentRuntime,
  runPersistentRuntimeServer,
  startPersistentRuntime,
  stopPersistentRuntime,
} from "./persistent-runtime.js";
const version = typeof __CLI_VERSION__ === "string" ? __CLI_VERSION__ : "0.0.0";
const EMPTY_TARGET_ERROR = "--target requires non-empty text.";
const DEFAULT_HEADLESS_PROMPT_MODE = "yolo";
const FORCE_MCS_SCOPE_ERROR = "--force-mcs can only be used with --prompt, --target, or tui.";
const TARGET_REPLACE_REQUIRES_TARGET_ERROR = "--target-replace requires --target.";
const TARGET_CONFLICTS_WITH_PROMPT_ERROR = '--target cannot be used with --prompt. Use either --target <objective> or --prompt "/goal <objective>".';
const BROWSER_EXECUTABLE_REQUIRES_HEADLESS_ERROR = "--browser-executable requires --browser-use=headless.";
const BROWSER_USE_SCOPE_ERROR = "--browser-use=headless can only be used with --prompt, --target, or tui.";
const SURFACE_SCOPE_ERROR = "--surface can only be used with --prompt, --target, app-server, or agent-server.";
const MEMORY_BENCH_SCOPE_ERROR = "--memory-bench can only be used with -p/--prompt.";
const ENABLE_WORKFLOW_SCOPE_ERROR = "--enable-workflow can only be used with -p/--prompt or --target.";
const commandName = (positionals) => positionals[0] ?? "tui";
const isForceMcsSupportedInvocation = (input) => typeof input.prompt === "string" ||
    input.targetRequest !== undefined ||
    commandName(input.positionals) === "tui";
const isPresentationSurfaceSupportedInvocation = (input) => {
    const command = commandName(input.positionals);
    return (typeof input.prompt === "string" ||
        input.targetRequest !== undefined ||
        command === "app-server" ||
        command === "agent-server");
};
const globalOptions = (values, locale, detectedLocale, browserUse, browserExecutable, outputFormat) => {
    return {
        browserExecutable,
        browserUse,
        detectedLocale,
        ...(values["enable-workflow"] === true ? { enableWorkflow: true } : {}),
        force: values.force === true,
        json: values.json === true,
        locale,
        ...(values["memory-bench"] === true ? { memoryBench: true } : {}),
        noColor: values["no-color"] === true,
        ...(outputFormat ? { outputFormat } : {}),
        verbose: values.verbose === true,
    };
};
const OUTPUT_FORMATS = ["text", "json", "stream-json"];
/**
 * Validate --output-format. Rejecting an unknown value matters more than it
 * looks: a caller that misspells it would otherwise get plain text back and
 * silently parse nothing.
 */
const normalizeOutputFormat = (value) => {
    if (value === undefined)
        return undefined;
    if (OUTPUT_FORMATS.includes(value))
        return value;
    throw new Error(`--output-format must be one of ${OUTPUT_FORMATS.join(", ")} (received: ${value}).`);
};
const normalizeLocaleOption = (value) => {
    if (value === undefined)
        return undefined;
    if (isUiLocale(value))
        return value;
    throw new Error(getZCodeCopy().cli.errors.localeUnsupported(value));
};
const normalizePromptMode = (value) => {
    if (value === undefined)
        return undefined;
    const mode = value.toLowerCase();
    if (mode === "build" || mode === "plan" || mode === "edit" || mode === "yolo")
        return mode;
    throw new Error(`Unsupported --mode value: ${value}. Supported modes: build, edit, plan, yolo.`);
};
const normalizeBrowserUse = (value) => {
    if (value === undefined)
        return undefined;
    if (value.toLowerCase() === "headless")
        return "headless";
    throw new Error(`Unsupported --browser-use value: ${value}. Supported value: headless.`);
};
const normalizePresentationSurface = (value) => {
    if (value === undefined || value.toLowerCase() === "terminal")
        return "terminal";
    if (value.toLowerCase() === "desktop")
        return "zcode_desktop";
    throw new Error(`Unsupported --surface value: ${value}. Supported surfaces: terminal, desktop.`);
};
const normalizeTargetRequest = (values) => {
    const rawTarget = values.target;
    const replaceExisting = values["target-replace"] === true;
    if (rawTarget === undefined) {
        if (replaceExisting) {
            throw new Error(TARGET_REPLACE_REQUIRES_TARGET_ERROR);
        }
        return undefined;
    }
    const objective = rawTarget.trim();
    if (objective.length === 0) {
        throw new Error(EMPTY_TARGET_ERROR);
    }
    return {
        objective,
        replaceExisting,
    };
};
const buildHeadlessTargetCommand = (targetRequest) => targetRequest.replaceExisting
    ? `/goal replace ${targetRequest.objective}`
    : `/goal ${targetRequest.objective}`;
const writeHelp = (stdout, locale, detectedLocale) => {
    stdout.write(formatCliHelp(version, locale, detectedLocale));
};
const runDoctor = (ctx, options, workingDirectory) => {
    const runtime = getRuntimeInfo();
    const payload = {
        cli: {
            name: CLI_COMMAND_NAME,
            processName: CLI_PROCESS_NAME,
            version,
        },
        runtime: {
            arch: runtime.arch,
            cwd: workingDirectory,
            execPath: runtime.execPath,
            node: runtime.node,
            platform: runtime.platform,
            processTitle: process.title,
            sea: runtime.sea,
        },
        packaging: {
            default: "node-bundle",
            sea: "optional",
        },
    };
    if (options.json) {
        ctx.stdout.write(formatJson(payload));
        return 0;
    }
    const colors = supportsColor(ctx.stdout, options.noColor);
    ctx.stdout.write(`${color.bold("scode doctor", colors)}\n`);
    ctx.stdout.write(`version: ${payload.cli.version}\n`);
    ctx.stdout.write(`process: ${payload.runtime.processTitle}\n`);
    ctx.stdout.write(`node: ${payload.runtime.node}\n`);
    ctx.stdout.write(`platform: ${payload.runtime.platform}/${payload.runtime.arch}\n`);
    ctx.stdout.write(`sea: ${payload.runtime.sea ? "yes" : "no"} (${payload.packaging.sea})\n`);
    ctx.stdout.write(`default artifact: ${payload.packaging.default}\n`);
    if (options.verbose) {
        ctx.stdout.write(`execPath: ${payload.runtime.execPath}\n`);
        ctx.stdout.write(`cwd: ${payload.runtime.cwd}\n`);
    }
    return 0;
};
const runZCodeProtocolCommand = async (ctx, options, deps, presentationSurface, prepareStorageOnly = false) => {
    try {
        const env = prepareCliRuntimeEnv(deps.env ?? process.env);
        const workingDirectory = (deps.cwd ?? process.cwd)();
        const dotenvResult = shouldLoadCliDotenvForProtocolServer(env)
            ? (deps.loadDotenv ?? loadCliDotenv)({
                cwd: workingDirectory,
                env,
            })
            : {
                keys: [],
                loaded: false,
            };
        applyCliRuntimeEnvSanitization(env);
        if (dotenvResult.error) {
            throw new Error(`Failed to load environment file: ${dotenvResult.path}`, {
                cause: dotenvResult.error,
            });
        }
        const runProtocolAgent = deps.runZCodeProtocolAgent ?? (await loadBootstrapModule()).runZCodeProtocolAgent;
        await runProtocolAgent({
            lifecycle: deps.protocolLifecycle,
            cwd: workingDirectory,
            env,
            input: deps.protocolInput ?? ctx.stdin,
            output: ctx.stdout,
            presentationSurface,
            prepareStorageOnly,
            version,
        });
        return 0;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.stderr.write(`Error: ${message}\n`);
        if (options.verbose && error instanceof Error && error.stack) {
            ctx.stderr.write(`${error.stack}\n`);
        }
        return 1;
    }
};
export const run = async (ctx, deps = {}) => {
    let parsed;
    let toolDisallowlist;
    try {
        const extracted = extractDisallowedToolsArgs(ctx.argv);
        parsed = parseGlobalArgs(extracted.args);
        toolDisallowlist = extracted.toolDisallowlist;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.stderr.write(`${message}\n\n`);
        writeHelp(ctx.stderr);
        return 1;
    }
    let locale;
    try {
        locale = normalizeLocaleOption(parsed.values.locale);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.stderr.write(`${message}\n`);
        return 1;
    }
    let mode;
    let browserUse;
    let presentationSurface;
    try {
        mode = normalizePromptMode(parsed.values.mode);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.stderr.write(`${message}\n`);
        return 1;
    }
    try {
        browserUse = normalizeBrowserUse(parsed.values["browser-use"]);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.stderr.write(`${message}\n`);
        return 1;
    }
    try {
        presentationSurface = normalizePresentationSurface(parsed.values.surface);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.stderr.write(`${message}\n`);
        return 1;
    }
    const browserExecutable = parsed.values["browser-executable"];
    if (browserExecutable !== undefined && browserUse !== "headless") {
        ctx.stderr.write(`${BROWSER_EXECUTABLE_REQUIRES_HEADLESS_ERROR}\n`);
        return 1;
    }
    const resumeRequest = {
        continueSession: parsed.values.continue === true,
        resumeSessionId: parsed.values.resume,
    };
    if (resumeRequest.continueSession && resumeRequest.resumeSessionId) {
        ctx.stderr.write("--resume and --continue cannot be used together.\n");
        return 1;
    }
    const env = prepareCliRuntimeEnv(deps.env ?? process.env);
    const detectedLocale = detectCliLocale(env);
    let outputFormat;
    try {
        outputFormat = normalizeOutputFormat(parsed.values["output-format"]);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.stderr.write(`${message}\n`);
        return 1;
    }
    const options = globalOptions(parsed.values, locale, detectedLocale, browserUse, browserExecutable, outputFormat);
    const forceMcs = parsed.values["force-mcs"] === true;
    let targetRequest;
    try {
        targetRequest = normalizeTargetRequest(parsed.values);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.stderr.write(`${message}\n`);
        return 1;
    }
    if (targetRequest && typeof parsed.values.prompt === "string") {
        ctx.stderr.write(`${TARGET_CONFLICTS_WITH_PROMPT_ERROR}\n`);
        return 1;
    }
    if (parsed.values.surface !== undefined &&
        !isPresentationSurfaceSupportedInvocation({
            positionals: parsed.positionals,
            prompt: parsed.values.prompt,
            targetRequest,
        })) {
        ctx.stderr.write(`${SURFACE_SCOPE_ERROR}\n`);
        return 1;
    }
    if (parsed.values.help === true) {
        writeHelp(ctx.stdout, options.locale, options.detectedLocale);
        return 0;
    }
    if (parsed.values.version === true) {
        ctx.stdout.write(`${version}\n`);
        return 0;
    }
    if (options.enableWorkflow &&
        (parsed.positionals.length > 0 ||
            (typeof parsed.values.prompt !== "string" && targetRequest === undefined))) {
        ctx.stderr.write(`${ENABLE_WORKFLOW_SCOPE_ERROR}\n`);
        return 1;
    }
    if (options.memoryBench &&
        (typeof parsed.values.prompt !== "string" || parsed.positionals.length > 0)) {
        ctx.stderr.write(`${MEMORY_BENCH_SCOPE_ERROR}\n`);
        return 1;
    }
    if (browserUse === "headless" &&
        !isForceMcsSupportedInvocation({
            positionals: parsed.positionals,
            prompt: parsed.values.prompt,
            targetRequest,
        })) {
        ctx.stderr.write(`${BROWSER_USE_SCOPE_ERROR}\n`);
        return 1;
    }
    if (forceMcs &&
        !isForceMcsSupportedInvocation({
            positionals: parsed.positionals,
            prompt: parsed.values.prompt,
            targetRequest,
        })) {
        ctx.stderr.write(`${FORCE_MCS_SCOPE_ERROR}\n`);
        return 1;
    }
    let workingDirectory;
    try {
        workingDirectory = resolveCliCwd({
            cwd: deps.cwd ?? process.cwd,
            requestedCwd: parsed.values.cwd,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.stderr.write(`${message}\n`);
        return 1;
    }
    const commandDeps = {
        ...deps,
        cwd: () => workingDirectory,
        env,
        logger: deps.logger ??
            createNodeLoggerFactory({ env }).createLogger("zcode").child({ module: "cli" }),
        loadDotenv: (dotenvOptions = {}) => {
            const dotenvResult = (deps.loadDotenv ?? loadCliDotenv)(dotenvOptions);
            applyCliRuntimeEnvSanitization(dotenvOptions.env ?? env);
            return dotenvResult;
        },
    };
    if (typeof parsed.values.prompt === "string") {
        return await runPrompt(ctx, parsed.values.prompt, parsed.values.attach ?? [], options, commandDeps, version, mode ?? DEFAULT_HEADLESS_PROMPT_MODE, resumeRequest, toolDisallowlist, forceMcs, presentationSurface);
    }
    if (targetRequest) {
        return await runPrompt(ctx, buildHeadlessTargetCommand(targetRequest), [], options, commandDeps, version, mode, resumeRequest, toolDisallowlist, forceMcs, presentationSurface);
    }
    switch (commandName(parsed.positionals)) {
        case "help":
            writeHelp(ctx.stdout, options.locale, options.detectedLocale);
            return 0;
        case "version":
            ctx.stdout.write(`${version}\n`);
            return 0;
        case "mcp-server":
            return await runScodeMcpServer(workingDirectory);
        case "runtime-start": {
            const state = await startPersistentRuntime(workingDirectory);
            ctx.stdout.write(`${JSON.stringify(state)}\n`);
            return 0;
        }
        case "runtime-server":
            return await runPersistentRuntimeServer(workingDirectory);
        case "runtime-call": {
            const raw = parsed.positionals.slice(1).join(" ").trim();
            if (!raw) {
                ctx.stderr.write("runtime-call requires one JSON request argument.\n");
                return 1;
            }
            let request;
            try {
                request = JSON.parse(raw);
            }
            catch (error) {
                ctx.stderr.write(`Invalid runtime-call JSON: ${error instanceof Error ? error.message : String(error)}\n`);
                return 1;
            }
            const response = await callPersistentRuntime(workingDirectory, request);
            ctx.stdout.write(`${JSON.stringify(response)}\n`);
            return "error" in response ? 1 : 0;
        }
        case "runtime-stop": {
            const stopped = await stopPersistentRuntime(workingDirectory);
            ctx.stdout.write(`${JSON.stringify({ stopped })}\n`);
            return 0;
        }
        case "agent-server":
        case "app-server":
            return await runZCodeProtocolCommand(ctx, options, commandDeps, presentationSurface, parsed.values["prepare-storage"] === true);
        case "doctor":
            return runDoctor(ctx, options, workingDirectory);
        case "tool":
            return await runExternalToolCommand(ctx, parsed.positionals.slice(1), commandDeps, version, mode ?? DEFAULT_HEADLESS_PROMPT_MODE);
        case "tui":
            return await runTuiCommand(ctx, options, commandDeps, version, mode, resumeRequest, toolDisallowlist, forceMcs);
        default:
            ctx.stderr.write(`Unknown command: ${commandName(parsed.positionals)}\n\n`);
            writeHelp(ctx.stderr, options.locale, options.detectedLocale);
            return 1;
    }
};
