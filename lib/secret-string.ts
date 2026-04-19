/**
 * Secrets Manager stores payload as SecretString (UTF-8 string). JSON request
 * bodies may deserialize structured values; normalize so CreateSecret/PutSecretValue
 * always receive a string, with JSON object/array leaf values stored as strings.
 */

/** Recursively coerce object/array leaves to strings (JSON null → "null"). */
export function deepStringifyLeafValues(value: unknown): unknown {
  if (value === null) return String(value);
  if (value === undefined) return String(value);
  const t = typeof value;
  if (t === "string") return value;
  if (t === "number" || t === "boolean" || t === "bigint") return String(value);
  if (t === "symbol") return String(value);
  if (t === "function") return String(value);
  if (value instanceof Date) return String(value);
  if (Array.isArray(value)) return value.map((v) => deepStringifyLeafValues(v));
  if (t === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepStringifyLeafValues(v);
    }
    return out;
  }
  return String(value);
}

/** Turn a JSON.parse() result into the UTF-8 secret string we store in AWS. */
export function formatParsedSecretJsonForStorage(parsed: unknown): string {
  if (parsed === null || parsed === undefined) return String(parsed);
  if (typeof parsed === "string") return parsed;
  if (typeof parsed === "number" || typeof parsed === "boolean" || typeof parsed === "bigint") {
    return String(parsed);
  }
  if (typeof parsed === "object") {
    return JSON.stringify(deepStringifyLeafValues(parsed));
  }
  return String(parsed);
}

export function coerceSecretStringForStorage(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return "";
    try {
      const parsed = JSON.parse(value);
      return formatParsedSecretJsonForStorage(parsed);
    } catch {
      return value;
    }
  }
  if (typeof value === "object") {
    return JSON.stringify(deepStringifyLeafValues(value));
  }
  return String(value);
}
