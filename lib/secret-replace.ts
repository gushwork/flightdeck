export interface SecretReplaceChange {
  /** JSON path of the changed value (e.g. `db.replicas[0].url`); absent for plain-string secrets. */
  key?: string;
  before: string;
  after: string;
  occurrences: number;
}

export interface SecretReplaceOutcome {
  /** Secret string to write; equals the input when nothing matched. */
  next: string;
  changes: SecretReplaceChange[];
}

/** Excerpt around the first hit; the same window lines up in `before` and `after` because the prefix is unchanged. */
function excerpt(text: string, idx: number, len: number): string {
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + len + 40);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

function replaceText(text: string, find: string, replace: string, key?: string): SecretReplaceChange | null {
  const idx = text.indexOf(find);
  if (idx === -1) return null;
  const next = text.replaceAll(find, replace);
  return {
    key,
    before: excerpt(text, idx, find.length),
    after: excerpt(next, idx, replace.length),
    occurrences: text.split(find).length - 1,
  };
}

function replaceInJson(
  node: unknown,
  path: string,
  find: string,
  replace: string,
  changes: SecretReplaceChange[],
): unknown {
  if (node === null || typeof node !== 'object') {
    if (typeof node !== 'string' && typeof node !== 'number' && typeof node !== 'boolean') return node;
    const text = String(node);
    const change = replaceText(text, find, replace, path || undefined);
    if (!change) return node;
    changes.push(change);
    return text.replaceAll(find, replace);
  }
  if (Array.isArray(node)) {
    return node.map((item, i) => replaceInJson(item, `${path}[${i}]`, find, replace, changes));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = replaceInJson(v, path ? `${path}.${k}` : k, find, replace, changes);
  }
  return out;
}

/**
 * Case-sensitive find/replace inside a secret value.
 * JSON objects/arrays: replaces inside values only (keys untouched) and re-serializes, so
 * quotes/backslashes in `replace` can't corrupt the JSON and escaped text still matches.
 * Anything else: plain string replace.
 */
export function replaceInSecretString(secretString: string, find: string, replace: string): SecretReplaceOutcome {
  if (!find || find === replace) return { next: secretString, changes: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(secretString);
  } catch {
    parsed = undefined;
  }

  if (parsed !== null && typeof parsed === 'object') {
    const changes: SecretReplaceChange[] = [];
    const updated = replaceInJson(parsed, '', find, replace, changes);
    return { next: changes.length > 0 ? JSON.stringify(updated) : secretString, changes };
  }

  const change = replaceText(secretString, find, replace);
  return change
    ? { next: secretString.replaceAll(find, replace), changes: [change] }
    : { next: secretString, changes: [] };
}
