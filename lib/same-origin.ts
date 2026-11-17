/** Only accept JSON writes from this app's own pages (blocks cross-site form posts and other origins). */
export function isSameOriginJson(req: Request): boolean {
  if (!req.headers.get("content-type")?.startsWith("application/json")) return false;
  return !isCrossSiteWrite(req);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * True when a browser sent a state-changing request from another site or origin.
 * Requests with no `Sec-Fetch-Site` and no `Origin` come from non-browser clients (curl, tests) and pass.
 */
export function isCrossSiteWrite(req: Request): boolean {
  if (SAFE_METHODS.has(req.method)) return false;
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== req.headers.get("host");
  } catch {
    return true; // "null" (sandboxed frame, data: URL) or malformed
  }
}
