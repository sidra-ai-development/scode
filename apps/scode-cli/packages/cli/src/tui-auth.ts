import type { RunDependencies } from "./cli-types.js";
import type {
  CommandCenterApiKeyOptions,
  CommandCenterBigmodelLoginOptions,
  CommandCenterLoginOptions,
} from "./command-center/types.js";

const LOCAL_ONLY_ERROR = "SCODE local runtime does not use cloud login or API keys.";

export async function loginForTui(
  _deps: RunDependencies,
  _options?: CommandCenterLoginOptions,
): Promise<never> {
  throw new Error(LOCAL_ONLY_ERROR);
}

export async function loginBigmodelForTui(
  _deps: RunDependencies,
  _options?: CommandCenterBigmodelLoginOptions,
): Promise<never> {
  throw new Error(LOCAL_ONLY_ERROR);
}

export async function configureApiKeyForTui(
  _deps: RunDependencies,
  _options: CommandCenterApiKeyOptions,
): Promise<never> {
  throw new Error(LOCAL_ONLY_ERROR);
}

export async function logoutForTui(_deps: RunDependencies): Promise<never> {
  throw new Error(LOCAL_ONLY_ERROR);
}
