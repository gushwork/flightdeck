export type SecretsBrowseFilter =
  | "all"
  | "dev"
  | "staging"
  | "prod"
  | "no-rotation"
  | "stale";

export type SecretsPageMode = "browse" | "values";

const FILTERS = new Set<SecretsBrowseFilter>([
  "all",
  "dev",
  "staging",
  "prod",
  "no-rotation",
  "stale",
]);

export function parseSecretsBrowseFilter(raw: string | null): SecretsBrowseFilter {
  if (raw && FILTERS.has(raw as SecretsBrowseFilter)) return raw as SecretsBrowseFilter;
  return "all";
}

export function parseSecretsMode(raw: string | null): SecretsPageMode {
  return raw === "values" ? "values" : "browse";
}

export function secretsHref(opts: {
  mode?: SecretsPageMode;
  filter?: SecretsBrowseFilter;
  q?: string;
} = {}): string {
  const params = new URLSearchParams();
  if (opts.mode === "values") {
    params.set("mode", "values");
    const query = opts.q?.trim();
    if (query) params.set("q", query);
  } else if (opts.filter && opts.filter !== "all") {
    params.set("filter", opts.filter);
  }
  const qs = params.toString();
  return qs ? `/secrets?${qs}` : "/secrets";
}
