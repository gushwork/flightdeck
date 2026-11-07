export interface SecretValueMatch {
  /** Dotted / indexed JSON path (e.g. `db.replicas[0].url`); absent for non-JSON secrets. */
  key?: string;
  context: string;
}

function snippetAround(value: string, query: string): string {
  const idx = value.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return value.slice(0, 120) + (value.length > 120 ? '…' : '');
  const start = Math.max(0, idx - 50);
  const end = Math.min(value.length, idx + query.length + 50);
  return (start > 0 ? '…' : '') + value.slice(start, end) + (end < value.length ? '…' : '');
}

function collectJsonMatches(node: object, path: string, query: string, out: SecretValueMatch[]): void {
  const q = query.toLowerCase();
  const isArray = Array.isArray(node);
  for (const [k, value] of Object.entries(node)) {
    const key = isArray ? `${path}[${k}]` : path ? `${path}.${k}` : k;
    const keyHit = !isArray && k.toLowerCase().includes(q);
    if (value !== null && typeof value === 'object' && !keyHit) {
      collectJsonMatches(value, key, query, out);
      continue;
    }
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (keyHit || text.toLowerCase().includes(q)) {
      out.push({ key, context: `${key}: ${snippetAround(text, query)}` });
    }
  }
}

/**
 * Every place `query` appears in a secret value (case-insensitive).
 * JSON secrets: one match per matching key or leaf value, nested paths included.
 * Plain strings (or JSON whose only hit is outside any key/value): one raw snippet.
 */
export function findSecretValueMatches(secretString: string, query: string): SecretValueMatch[] {
  const q = query.trim();
  if (!q) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(secretString);
  } catch {
    parsed = undefined;
  }

  if (parsed !== null && typeof parsed === 'object') {
    const matches: SecretValueMatch[] = [];
    collectJsonMatches(parsed, '', q, matches);
    if (matches.length > 0) return matches;
  }

  return secretString.toLowerCase().includes(q.toLowerCase())
    ? [{ context: snippetAround(secretString, q) }]
    : [];
}
