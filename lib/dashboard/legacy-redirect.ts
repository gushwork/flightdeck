export type LegacyRedirectFrom =
  | "/aws"
  | "/github/overview"
  | "/secrets/overview"
  | "/secrets/search"
  | "/amplify/search";

export function legacyDashboardRedirect(
  from: LegacyRedirectFrom,
  query: Record<string, string | string[] | undefined>,
): string {
  const q = typeof query.q === "string" ? query.q : undefined;
  switch (from) {
    case "/aws":
      return "/";
    case "/github/overview":
      return "/github";
    case "/secrets/overview":
      return "/secrets";
    case "/secrets/search":
      return q
        ? `/secrets?mode=values&q=${encodeURIComponent(q)}`
        : "/secrets?mode=values";
    case "/amplify/search":
      return q
        ? `/amplify?mode=search&q=${encodeURIComponent(q)}`
        : "/amplify?mode=search";
  }
}
