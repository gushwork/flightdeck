import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const GITHUB_API_BASE = "https://api.github.com";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let tokenInFlight: Promise<string> | null = null;
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Extracts the GitHub token from the locally authenticated gh CLI.
 * Caches for 30 minutes so repeated API calls don't shell out every time.
 * Concurrent callers share one in-flight `gh auth token` process.
 */
export async function getGithubToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }
  if (tokenInFlight) return tokenInFlight;

  tokenInFlight = (async () => {
    try {
      const { stdout } = await execFileAsync("gh", ["auth", "token"], {
        env: { ...process.env, PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin" },
        timeout: 10_000,
      });
      const token = stdout.trim();
      if (!token) throw new Error("gh auth token returned empty output");
      cachedToken = token;
      tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
      return token;
    } catch (err) {
      throw new Error(
        `Failed to get GitHub token from gh CLI: ${err instanceof Error ? err.message : String(err)}. ` +
          "Run `gh auth login` to authenticate.",
      );
    } finally {
      tokenInFlight = null;
    }
  })();
  return tokenInFlight;
}

/** Invalidates the cached token — call after auth errors. */
export function invalidateGithubToken(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
  etagCache.clear();
}

// ─── Conditional request (ETag) cache ─────────────────────────────────────────
// GitHub answers `If-None-Match` with 304, which is faster (empty body) and does
// not count against the primary rate limit. Polling endpoints benefit the most.

const ETAG_CACHE_MAX = 1_000;
const etagCache = new Map<string, { etag: string; body: unknown; link: string }>();

function etagGet(url: string) {
  const hit = etagCache.get(url);
  if (hit) {
    // refresh LRU position
    etagCache.delete(url);
    etagCache.set(url, hit);
  }
  return hit;
}

function etagSet(url: string, etag: string, body: unknown, link: string) {
  etagCache.delete(url);
  etagCache.set(url, { etag, body, link });
  if (etagCache.size > ETAG_CACHE_MAX) {
    const oldest = etagCache.keys().next().value;
    if (oldest !== undefined) etagCache.delete(oldest);
  }
}

// ─── Short-lived memo with in-flight dedupe ───────────────────────────────────

const memoStore = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

/**
 * Memoize an async result for `ttlMs`. Concurrent callers share the same promise;
 * rejected promises are evicted immediately so errors are not cached.
 */
export function memoize<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = memoStore.get(key);
  if (hit && hit.expiresAt > now) return hit.value as Promise<T>;

  const value = fn();
  memoStore.set(key, { expiresAt: now + ttlMs, value });
  value.catch(() => {
    if (memoStore.get(key)?.value === value) memoStore.delete(key);
  });
  return value;
}

/** Drop memoized entries whose key starts with `prefix` (e.g. after a mutation). */
export function invalidateMemo(prefix: string): void {
  for (const key of memoStore.keys()) {
    if (key.startsWith(prefix)) memoStore.delete(key);
  }
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

export interface GithubFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Abort the request after this many ms. */
  timeoutMs?: number;
}

function baseHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function rawGet(url: string, timeoutMs?: number): Promise<{ body: unknown; link: string }> {
  const token = await getGithubToken();
  const cached = etagGet(url);
  const res = await fetch(url, {
    headers: {
      ...baseHeaders(token),
      ...(cached ? { "If-None-Match": cached.etag } : {}),
    },
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });

  if (res.status === 304 && cached) {
    return { body: cached.body, link: cached.link };
  }
  if (res.status === 401) {
    invalidateGithubToken();
    throw new Error("GitHub authentication failed. Run `gh auth login` to re-authenticate.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }

  const body = (await res.json()) as unknown;
  const link = res.headers.get("Link") ?? "";
  const etag = res.headers.get("ETag");
  if (etag) etagSet(url, etag, body, link);
  return { body, link };
}

/**
 * Authenticated fetch wrapper for the GitHub REST API.
 * Automatically injects Bearer token from gh CLI auth. GETs use ETag revalidation.
 */
export async function githubFetch<T = unknown>(
  path: string,
  options: GithubFetchOptions = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${GITHUB_API_BASE}${path}`;
  const method = options.method ?? "GET";

  if (method === "GET" && !options.headers && options.body === undefined) {
    return (await rawGet(url, options.timeoutMs)).body as T;
  }

  const token = await getGithubToken();
  const res = await fetch(url, {
    method,
    headers: {
      ...baseHeaders(token),
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
  });

  if (res.status === 401) {
    invalidateGithubToken();
    throw new Error("GitHub authentication failed. Run `gh auth login` to re-authenticate.");
  }

  if (res.status === 204 || res.status === 202) {
    return {} as T;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Paginated GitHub fetch — collects all pages into a single array.
 * Respects GitHub's Link header for cursor-based pagination.
 */
export async function githubFetchPaginated<T>(
  path: string,
  perPage = 100,
): Promise<T[]> {
  const separator = path.includes("?") ? "&" : "?";
  let url: string | null = `${GITHUB_API_BASE}${path}${separator}per_page=${perPage}`;
  const results: T[] = [];

  while (url) {
    const { body, link } = await rawGet(url);
    if (Array.isArray(body)) {
      results.push(...(body as T[]));
    }

    // Parse Link header for next page
    const nextMatch: RegExpMatchArray | null = link.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  return results;
}
