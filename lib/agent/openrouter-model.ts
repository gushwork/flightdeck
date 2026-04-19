/** Matches Settings page localStorage key for the selected OpenRouter model. */
export const OPENROUTER_MODEL_STORAGE_KEY = "openrouter-model";

export const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-4-6";

/**
 * Resolves the model id for OpenRouter: request body (from UI) > env > default.
 */
export function resolveOpenRouterModel(bodyModel?: string | null): string {
  const fromBody = bodyModel?.trim();
  if (fromBody) return fromBody;
  const fromEnv = process.env.OPENROUTER_MODEL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_OPENROUTER_MODEL;
}
