/** SCODE local runtime: telemetry is intentionally disabled. */
export async function prepareZCodeTelemetryEnv(
  env: NodeJS.ProcessEnv = process.env,
  _options: unknown = {},
): Promise<NodeJS.ProcessEnv> {
  return env;
}

export async function shutdownZCodeTelemetry(): Promise<void> {
  return;
}
