import { formatNewSessionResult, formatResumeResult } from "./formatters.js";
import { handleContextCommand } from "./handlers/context.js";
import { handleEffortCommand } from "./handlers/effort.js";
import { handleLocaleCommand } from "./handlers/locale.js";
import { handleMcpCommand } from "./handlers/mcp.js";
import { handleModeCommand } from "./handlers/mode.js";
import { handleModelCommand } from "./handlers/model.js";
import { handleThemeCommand } from "./handlers/theme.js";
import { recordSlashCommandInHistory } from "./history.js";
import { attachCurrentSessionMetadata, normalizeTuiPromptInput } from "./metadata.js";
import { buildCheckpointSelection, buildSessionSelection } from "./selections.js";
import {
  AVAILABLE_COMMANDS,
  formatSlashCommandHelp,
  parseSlashCommand
} from "./slash-commands.js";
function createCommandCenter(deps) {
  return async (input, options) => {
    const promptInput = normalizeTuiPromptInput(input);
    const command = parseSlashCommand(promptInput.text);
    const hasAttachments = (promptInput.attachments?.length ?? 0) > 0;
    if (!command) {
      const app = await deps.getApp();
      return attachCurrentSessionMetadata(await app.submitPrompt(input, options), deps, app);
    }
    if (hasAttachments) {
      return {
        mode: deps.getMode?.(),
        response: "Image attachments are only supported for normal prompts."
      };
    }
    if (command.type === "unknown") {
      return {
        mode: deps.getMode?.(),
        response: `Unknown command: /${command.rawName}. Available commands: ${AVAILABLE_COMMANDS.join(", ")}.`
      };
    }
    const result = await (async () => {
      if (command.name === "help") {
        return {
          mode: deps.getMode?.(),
          response: formatSlashCommandHelp(command.args)
        };
      }
      if (command.name === "compact") {
        const app = await deps.getApp();
        const prompt = command.args ? `/compact ${command.args}` : "/compact";
        return attachCurrentSessionMetadata(await app.submitPrompt(prompt, options), deps, app);
      }
      if (command.name === "context") {
        return handleContextCommand(command.args, deps);
      }
      if (command.name === "init") {
        const app = await deps.getApp();
        const prompt = command.args ? `/init ${command.args}` : "/init";
        return attachCurrentSessionMetadata(await app.submitPrompt(prompt, options), deps, app);
      }
      if (command.name === "effort") {
        return handleEffortCommand(command.args, deps);
      }
      if (command.name === "rewind") {
        const app = await deps.getApp();
        if (command.args.length === 0 && app.listCheckpoints) {
          return {
            mode: deps.getMode?.(),
            response: "Select a checkpoint to rewind.",
            selection: buildCheckpointSelection("rewind", await app.listCheckpoints({ limit: 50 }))
          };
        }
        const prompt = command.args ? `/rewind ${command.args}` : "/rewind";
        return attachCurrentSessionMetadata(await app.submitPrompt(prompt, options), deps, app);
      }
      if (command.name === "fork") {
        if (command.args.length === 0) {
          const app2 = await deps.getApp();
          if (app2.listCheckpoints) {
            return {
              mode: deps.getMode?.(),
              response: "Select a checkpoint to fork.",
              selection: buildCheckpointSelection("fork", await app2.listCheckpoints({ limit: 50 }))
            };
          }
        }
        const targetCheckpointId = parseForkTarget(command.args);
        if (deps.forkApp) {
          const result2 = await deps.forkApp(targetCheckpointId);
          return {
            mode: deps.getMode?.(),
            response: result2.response,
            traceId: void 0
          };
        }
        const app = await deps.getApp();
        const prompt = targetCheckpointId ? `/fork ${targetCheckpointId}` : "/fork latest";
        return attachCurrentSessionMetadata(await app.submitPrompt(prompt, options), deps, app);
      }
      if (command.name === "locale") {
        return handleLocaleCommand(command.args, deps);
      }
      if (command.name === "mcp") {
        return handleMcpCommand(command.args, deps);
      }
      if (command.name === "mode") {
        return handleModeCommand(command.args, deps);
      }
      if (command.name === "model") {
        return handleModelCommand(command.args, deps, promptInput.modelSelection);
      }
      if (command.name === "theme") {
        return handleThemeCommand(command.args, deps);
      }
      if (command.name === "new") {
        if (command.args.length > 0) {
          return {
            mode: deps.getMode?.(),
            response: "Usage: /new"
          };
        }
        if (!deps.newApp) {
          return {
            mode: deps.getMode?.(),
            response: "Creating a new session is not available in this client."
          };
        }
        const app = await deps.newApp();
        return {
          mode: deps.getMode?.(),
          locale: app.getLocale?.(),
          model: app.getModel?.(),
          theme: app.getTheme?.(),
          resetSessionProjection: true,
          response: formatNewSessionResult(app.sessionId),
          sessionId: app.sessionId,
          thoughtLevel: app.getThoughtLevel?.(),
          traceId: app.traceId
        };
      }
      if (command.name === "resume") {
        if (command.args.length === 0 && command.rawName === "resume" && deps.listSessions) {
          return {
            mode: deps.getMode?.(),
            response: "Select a session to resume.",
            selection: buildSessionSelection(await deps.listSessions())
          };
        }
        const app = await deps.resumeApp(command.args || void 0);
        const result2 = await app.resume({
          onEvent: options.onEvent
        });
        const restoredMessages = app.loadSessionTranscript ? await app.loadSessionTranscript() : void 0;
        return {
          mode: deps.getMode?.(),
          locale: app.getLocale?.(),
          model: app.getModel?.(),
          theme: app.getTheme?.(),
          ...restoredMessages !== void 0 ? {
            resetSessionProjection: true,
            restoredMessages
          } : {},
          response: formatResumeResult(app.sessionId, result2),
          thoughtLevel: app.getThoughtLevel?.(),
          traceId: result2.traceId ?? app.traceId
        };
      }
      return {
        mode: deps.getMode?.(),
        response: `Unknown command: /${command.rawName}.`
      };
    })();
    await recordSlashCommandInHistory(deps, promptInput.text, command);
    return result;
  };
}
function parseForkTarget(args) {
  const trimmed = args.trim();
  if (trimmed.length === 0 || trimmed === "latest") return void 0;
  return trimmed;
}
export {
  createCommandCenter
};
