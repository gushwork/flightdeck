/**
 * Top bar Region/Account visibility. Keep in sync with AWS routes in
 * lib/modules/registry.ts (SIDEBAR_SERVICE_GROUPS AWS moduleIds).
 */
export function showAwsWorkspaceSelectors(pathname: string): boolean {
  if (pathname === "/secrets" || pathname.startsWith("/secrets/")) return true;
  if (pathname === "/analyzer" || pathname.startsWith("/analyzer/")) return true;
  if (pathname === "/iam" || pathname.startsWith("/iam/")) return true;
  if (pathname === "/amplify" || pathname.startsWith("/amplify/")) return true;
  if (pathname === "/route53" || pathname.startsWith("/route53/")) return true;
  return false;
}
