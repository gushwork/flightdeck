import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const GITHUB_API_BASE = "https://api.github.com";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Extracts the GitHub token from the locally authenticated gh CLI.
 * Caches for 30 minutes so repeated API calls don't shell out every time.
 */
export async function getGithubToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  try {
    const { stdout } = await execAsync("gh auth token", {
      env: { ...process.env, PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin" },
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
  }
}

/** Invalidates the cached token — call after auth errors. */
export function invalidateGithubToken(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
}

export interface GithubFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Additional headers */
  headers?: Record<string, string>;
}

/**
 * Authenticated fetch wrapper for the GitHub REST API.
 * Automatically injects Bearer token from gh CLI auth.
 */
export async function githubFetch<T = unknown>(
  path: string,
  options: GithubFetchOptions = {},
): Promise<T> {
  const token = await getGithubToken();

  const url = path.startsWith("http") ? path : `${GITHUB_API_BASE}${path}`;

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
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
    const token = await getGithubToken();
    const fetchRes: Response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!fetchRes.ok) {
      const text = await fetchRes.text().catch(() => fetchRes.statusText);
      throw new Error(`GitHub API error ${fetchRes.status}: ${text}`);
    }

    const page = (await fetchRes.json()) as T[];
    if (Array.isArray(page)) {
      results.push(...page);
    }

    // Parse Link header for next page
    const linkHeader: string = fetchRes.headers.get("Link") ?? "";
    const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  return results;
}
