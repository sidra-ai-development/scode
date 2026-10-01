// SCODE lean bootstrap public surface.

export * from "./app/create-app.js";
export type {
  ListZCodeSessionsOptions,
  PromptInput,
  ResolveLatestSessionOptions,
  ResumeOptions,
  RunZCodeProtocolAgentOptions,
  SendInputOptions,
  SendInputResult,
  SetLocaleResult,
  SetThemeResult,
  SteerTurnOptions,
  SubmitPromptOptions,
  UserPromptInput,
  ZCodeApp,
  ZCodeAppOptions,
  ZCodeModelOption,
} from "./app/types.js";

export {
  inspectZCodeCustomCommand,
  listZCodeCustomCommands,
  loadZCodeCustomCommand,
} from "./custom-commands.js";
export type {
  InspectZCodeCustomCommandOptions,
  ListZCodeCustomCommandsOptions,
  ZCodeCustomCommandInspection,
} from "./custom-commands.js";

export { startProcessProviderRegistryRuntime } from "./app/process-provider-registry-runtime.js";
export type { ProcessProviderRegistryRuntimeOptions } from "./app/process-provider-registry-runtime.js";
export { runZCodeProtocolAgent } from "./zcode-protocol-entrypoint.js";

export { mapSessionEvent } from "./zcode-protocol/session-mapper.js";
export type { SessionTranscriptMessage, SessionTranscriptPart } from "./session-transcript.js";
export { listZCodeSessions, resolveLatestSession } from "./sessions.js";
export { isReservedZCodeSlashCommandName } from "./slash-command-surface.js";
