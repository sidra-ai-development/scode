const LOCAL_ONLY_ERROR = "SCODE local runtime does not use cloud login or API keys.";
export async function loginForTui(_deps, _options) {
    throw new Error(LOCAL_ONLY_ERROR);
}
export async function loginBigmodelForTui(_deps, _options) {
    throw new Error(LOCAL_ONLY_ERROR);
}
export async function configureApiKeyForTui(_deps, _options) {
    throw new Error(LOCAL_ONLY_ERROR);
}
export async function logoutForTui(_deps) {
    throw new Error(LOCAL_ONLY_ERROR);
}
