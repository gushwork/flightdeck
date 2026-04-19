/**
 * Shared parsing/serialization for secret string editing (JSON, .env, key-value).
 */

import { formatParsedSecretJsonForStorage } from "@/lib/secret-string";

export type SecretOriginalKind = "plain" | "object";

export function parseEnvFile(content: string): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalizedLine = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;
    const separatorIndex = normalizedLine.indexOf("=");

    if (separatorIndex <= 0) continue;

    const key = normalizedLine.slice(0, separatorIndex).trim();
    let rawValue = normalizedLine.slice(separatorIndex + 1).trim();
    if (!key) continue;

    const hasMatchingQuotes =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"));
    if (hasMatchingQuotes) {
      rawValue = rawValue.slice(1, -1);
    }

    entries[key] = rawValue;
  }

  return entries;
}

/** Serialize flat string map to .env-style text (quoted when needed). */
export function serializeEnvFile(entries: Record<string, string>): string {
  return Object.entries(entries)
    .map(([k, v]) => {
      const needsQuote =
        v === "" ||
        /[\s#"']/.test(v) ||
        v.includes("\n") ||
        v.includes("=");
      if (!needsQuote) {
        return `${k}=${v}`;
      }
      const escaped = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
      return `${k}="${escaped}"`;
    })
    .join("\n");
}

export function stringToEditorDrafts(secretString: string): {
  kvRows: { key: string; value: string }[];
  jsonText: string;
  envText: string;
  originalKind: SecretOriginalKind;
} {
  try {
    const p = JSON.parse(secretString);
    if (p !== null && typeof p === "object" && !Array.isArray(p)) {
      const flat: Record<string, string> = {};
      const kvRows: { key: string; value: string }[] = [];
      for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
        const str = typeof v === "string" ? v : JSON.stringify(v);
        flat[k] = str;
        kvRows.push({ key: k, value: str });
      }
      return {
        kvRows,
        jsonText: JSON.stringify(p, null, 2),
        envText: serializeEnvFile(flat),
        originalKind: "object",
      };
    }
  } catch {
    /* plain string */
  }
  return {
    kvRows: [{ key: "value", value: secretString }],
    jsonText: secretString,
    envText: serializeEnvFile({ value: secretString }),
    originalKind: "plain",
  };
}

export function kvRowsToSecretString(
  rows: { key: string; value: string }[],
  originalKind: SecretOriginalKind,
): string {
  const cleaned = rows.filter((r) => r.key.trim() || r.value);
  if (
    originalKind === "plain" &&
    cleaned.length === 1 &&
    cleaned[0].key.trim() === "value"
  ) {
    return cleaned[0].value;
  }
  const o: Record<string, string> = {};
  for (const r of cleaned) {
    const k = r.key.trim();
    if (!k) continue;
    o[k] = r.value;
  }
  return JSON.stringify(o);
}

export function envTextToSecretString(
  envText: string,
  originalKind: SecretOriginalKind,
): string {
  const parsed = parseEnvFile(envText);
  const keys = Object.keys(parsed);
  if (keys.length === 0) {
    throw new Error("No KEY=value pairs in .env content");
  }
  if (originalKind === "plain" && keys.length === 1 && keys[0] === "value") {
    return parsed.value;
  }
  return JSON.stringify(parsed);
}

/** Valid JSON → normalized string; JSON string primitive → raw string; else raw text. */
export function jsonTextToSecretString(jsonText: string): string {
  const t = jsonText.trim();
  if (!t) throw new Error("Value cannot be empty");
  try {
    const p = JSON.parse(t);
    return formatParsedSecretJsonForStorage(p);
  } catch {
    return jsonText;
  }
}

/** Current editor state → secret string (for mode switching). */
export function draftFromMode(
  mode: "kv" | "json" | "env",
  kvRows: { key: string; value: string }[],
  jsonText: string,
  envText: string,
  originalKind: SecretOriginalKind,
): string {
  switch (mode) {
    case "kv":
      return kvRowsToSecretString(kvRows, originalKind);
    case "json":
      return jsonTextToSecretString(jsonText);
    case "env":
      return envTextToSecretString(envText, originalKind);
  }
}
