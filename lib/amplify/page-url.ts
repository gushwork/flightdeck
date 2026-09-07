export type AmplifyPageMode = "browse" | "search";

export function parseAmplifyMode(raw: string | null): AmplifyPageMode {
  return raw === "search" ? "search" : "browse";
}

export function amplifyHref(opts: { mode?: AmplifyPageMode; q?: string } = {}): string {
  const params = new URLSearchParams();
  if (opts.mode === "search") {
    params.set("mode", "search");
    if (opts.q) params.set("q", opts.q);
  }
  const qs = params.toString();
  return qs ? `/amplify?${qs}` : "/amplify";
}
