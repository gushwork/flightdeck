const SENSITIVE_KEY_PATTERN =
  /password|secret|token|credential|api_key|apikey|private_key/i;

const REMOVED_FIELDS = new Set([
  "secretstring",
  "secretbinary",
]);

export function stripSecretValues(data: unknown): unknown {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map(stripSecretValues);
  }

  if (typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = stripSecretValues(value);
      }
    }
    return result;
  }

  return data;
}

export function sanitizeForLlm(
  context: Record<string, unknown>,
): Record<string, unknown> {
  const stripped = stripSecretValues(context) as Record<string, unknown>;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stripped)) {
    if (!REMOVED_FIELDS.has(key.toLowerCase())) {
      result[key] = removeNestedSecretFields(value);
    }
  }
  return result;
}

function removeNestedSecretFields(data: unknown): unknown {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map(removeNestedSecretFields);
  }

  if (typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (!REMOVED_FIELDS.has(key.toLowerCase())) {
        result[key] = removeNestedSecretFields(value);
      }
    }
    return result;
  }

  return data;
}
