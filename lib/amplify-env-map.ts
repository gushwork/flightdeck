import { parseEnvFile, serializeEnvFile } from '@/lib/secret-value-format';

/** Pretty-printed JSON object for Amplify env maps (string values only in API). */
export function envMapToJsonText(env: Record<string, string>): string {
  return JSON.stringify(env, null, 2);
}

export function envMapToEnvText(env: Record<string, string>): string {
  return serializeEnvFile(env);
}

/**
 * Parse JSON text into a flat string map. Non-string leaf values are coerced like
 * `stringToEditorDrafts` for objects.
 */
export function parseEnvMapFromJson(text: string): Record<string, string> {
  const t = text.trim();
  if (!t) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    throw new Error('Invalid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON must be a non-null object (not an array)');
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

/** Parse .env text; empty content yields an empty map (clear all variables). */
export function parseEnvMapFromEnvText(text: string): Record<string, string> {
  const t = text.trim();
  if (!t) return {};
  return parseEnvFile(text);
}

export function draftsFromEnvMap(env: Record<string, string>): {
  jsonText: string;
  envText: string;
} {
  return {
    jsonText: envMapToJsonText(env),
    envText: envMapToEnvText(env),
  };
}
