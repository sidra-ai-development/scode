import { parseModelPickerValue } from "@zcode/shared/model-selection";
import { listAppEffortOptions } from "../effort-options.js";
import { rememberCurrentModelSelection } from "../model-selection.js";
import { buildModelSelection } from "../selections.js";
async function handleModelCommand(args, deps, selectedRef) {
  const app = await deps.getApp();
  const current = app.getModel?.();
  const options = app.listModels ? await app.listModels() : void 0;
  if (!app.getModel || !app.listModels || !app.setModel || !options) {
    return {
      mode: deps.getMode?.(),
      response: "Model selection is not available in this client."
    };
  }
  if (!selectedRef && args.length === 0) {
    const effortOptions = await listAppEffortOptions(app);
    return {
      ...effortOptions ? { effortOptions } : {},
      mode: deps.getMode?.(),
      model: current,
      modelOptions: options,
      response: "",
      selection: buildModelSelection(current, options),
      thoughtLevel: app.getThoughtLevel?.()
    };
  }
  if (!selectedRef && args === "list") {
    const effortOptions = await listAppEffortOptions(app);
    return {
      ...effortOptions ? { effortOptions } : {},
      mode: deps.getMode?.(),
      model: current,
      modelOptions: options,
      response: formatModelList(current, options),
      thoughtLevel: app.getThoughtLevel?.()
    };
  }
  try {
    const selection = resolveTuiModelSelection(args, options, selectedRef);
    await deps.prepareModelSelection?.(selection);
    const result = await app.setModel(selection);
    const persistenceWarning = await rememberCurrentModelSelection(app, deps);
    const effortOptions = await listAppEffortOptions(app);
    return {
      ...effortOptions ? { effortOptions } : {},
      mode: deps.getMode?.(),
      model: result.model,
      modelOptions: options,
      loginRequired: false,
      response: `Model switched to ${result.model} (${selection.options.reasoningLevel}).${persistenceWarning}`,
      thoughtLevel: result.thoughtLevel ?? app.getThoughtLevel?.()
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      mode: deps.getMode?.(),
      response: `Unable to switch model: ${message}`,
      model: current,
      modelOptions: options,
      thoughtLevel: app.getThoughtLevel?.()
    };
  }
}
function resolveTuiModelSelection(args, options, selectedRef) {
  const requested = selectedRef ?? options.find((option2) => `${option2.ref.providerId}/${option2.ref.modelId}` === args)?.ref ?? parseModelPickerValue(args);
  const option = options.find(
    ({ ref }) => ref.providerId === requested.providerId && ref.modelId === requested.modelId
  );
  if (!option) throw new Error(`Model is not available: ${args}`);
  if (option.disabledReason) throw new Error(option.disabledReason);
  const reasoningLevel = requested.options?.reasoningLevel ?? option.reasoning?.defaultLevel;
  if (!reasoningLevel || !option.reasoning?.levels.some((level) => level.value === reasoningLevel)) {
    throw new Error(
      `Select a supported reasoning effort: ${option.reasoning?.levels.map((level) => level.value).join(", ") || "none available"}`
    );
  }
  return {
    providerId: requested.providerId,
    modelId: requested.modelId,
    options: { reasoningLevel }
  };
}
function formatModelList(current, options) {
  const currentLine = `Current model: ${current || "not selected"}.`;
  if (options.length === 0) {
    return `${currentLine}
No selectable models are configured.`;
  }
  const lines = options.map((option) => {
    const id = `${option.ref.providerId}/${option.ref.modelId}`;
    const provider = option.providerLabel ?? option.ref.providerId;
    const disabled = option.disabledReason ? ` \u2014 ${option.disabledReason}` : "";
    return `- ${id} (${option.label}; ${provider})${disabled}`;
  });
  return [
    currentLine,
    "Available models:",
    ...lines,
    "Use /model <provider/model> to select a model, then /effort <level> to change reasoning effort."
  ].join("\n");
}
export {
  handleModelCommand
};
