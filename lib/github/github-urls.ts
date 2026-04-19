/**
 * Client-safe GitHub URL helpers (no Node-only imports).
 */

/** GitHub workflow badge SVG URLs must be https for <img> and to avoid mixed content. */
export function isValidHttpsBadgeUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== "string") return false;
  const t = url.trim();
  if (!t.startsWith("https://")) return false;
  try {
    const u = new URL(t);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * GitHub Actions UI URL for a workflow file, e.g.
 * https://github.com/owner/repo/actions/workflows/ci.yml
 */
export function githubActionsWorkflowPageUrl(
  repoFullName: string,
  workflowPath: string,
): string {
  const parts = workflowPath.split("/").filter(Boolean);
  const filename = parts.pop() ?? "";
  if (!filename) {
    return `https://github.com/${repoFullName}/actions`;
  }
  return `https://github.com/${repoFullName}/actions/workflows/${encodeURIComponent(filename)}`;
}
