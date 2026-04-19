"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import type { AmplifySearchHit } from "@/lib/types";

function HighlightedContext({ text, query }: { text: string; query: string }) {
  if (!query) return <span>{text}</span>;

  const parts: { text: string; highlight: boolean }[] = [];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let cursor = 0;

  while (cursor < text.length) {
    const idx = lower.indexOf(q, cursor);
    if (idx === -1) {
      parts.push({ text: text.slice(cursor), highlight: false });
      break;
    }
    if (idx > cursor) {
      parts.push({ text: text.slice(cursor, idx), highlight: false });
    }
    parts.push({
      text: text.slice(idx, idx + query.length),
      highlight: true,
    });
    cursor = idx + query.length;
  }

  return (
    <span>
      {parts.map((p, i) =>
        p.highlight ? (
          <mark
            key={i}
            className="rounded-sm bg-(--accent-dim) px-0.5 text-(--accent)"
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}

export default function AmplifySearchPage() {
  const { region, profile } = useAwsWorkspace();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AmplifySearchHit[]>([]);
  const [appsScanned, setAppsScanned] = useState(0);
  const [branchRowsScanned, setBranchRowsScanned] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const doSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const res = await fetch("/api/amplify/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          region,
          profile: profile.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.results);
      setAppsScanned(data.appsScanned);
      setBranchRowsScanned(data.branchRowsScanned);
      setElapsed(data.elapsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [query, region, profile]);

  return (
    <div className="space-y-4">
      <h1 className="font-(family-name:--font-display) text-3xl text-(--text-primary)">
        Amplify env search
      </h1>
      <p className="max-w-2xl text-sm text-(--text-secondary)">
        Search across <strong className="text-(--text-primary)">all</strong> Amplify
        apps in this region for matching environment variable keys or values (Hosting
        API only).
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void doSearch();
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search keys and values…"
          className="w-full max-w-md rounded-md border border-(--border) bg-(--bg-field) px-3 py-1.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-md bg-(--accent) px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-(--danger)/20 bg-(--danger-dim) px-4 py-3">
          <p className="text-sm text-(--danger)">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 py-12">
          <svg
            className="h-5 w-5 animate-spin text-(--accent)"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="text-sm text-(--text-muted)">
            Scanning Amplify apps and branches… this may take a moment.
          </p>
        </div>
      )}

      {hasSearched && !loading && !error && (
        <>
          <div className="rounded-md border border-(--accent)/20 bg-(--accent-dim) px-4 py-2.5 text-xs text-(--text-secondary)">
            Scanned{" "}
            <span className="font-(family-name:--font-mono) font-medium text-(--accent)">
              {appsScanned}
            </span>{" "}
            apps and{" "}
            <span className="font-(family-name:--font-mono) font-medium text-(--accent)">
              {branchRowsScanned}
            </span>{" "}
            branch records in{" "}
            <span className="font-(family-name:--font-mono) font-medium text-(--accent)">
              {elapsed}s
            </span>
            . Showing up to 300 matches.
          </div>

          <div className="space-y-2">
            {results.map((r, i) => (
              <div
                key={`${r.appId}-${r.scope}-${r.branchName ?? "app"}-${r.key}-${i}`}
                className="rounded-lg border border-(--border) bg-(--bg-card) p-3 transition-colors hover:bg-(--bg-hover)"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link
                    href={
                      r.scope === "branch" && r.branchName
                        ? `/amplify/${encodeURIComponent(r.appId)}?branch=${encodeURIComponent(r.branchName)}`
                        : `/amplify/${encodeURIComponent(r.appId)}`
                    }
                    className="font-medium text-(--accent) hover:underline"
                  >
                    {r.appName}
                  </Link>
                  <span className="font-(family-name:--font-mono) text-xs text-(--text-muted)">
                    {r.appId}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      r.scope === "app"
                        ? "bg-(--accent-dim) text-(--accent)"
                        : "bg-(--warn-dim) text-(--warn)"
                    }`}
                  >
                    {r.scope === "app" ? "App" : `Branch: ${r.branchName}`}
                  </span>
                  <span className="rounded bg-(--bg-muted) px-1.5 py-0.5 font-(family-name:--font-mono) text-[11px] text-(--text-secondary)">
                    {r.key}
                  </span>
                </div>
                <pre className="mt-2 overflow-x-auto rounded-md bg-(--bg-field) px-3 py-2 font-(family-name:--font-mono) text-xs text-(--text-secondary)">
                  <HighlightedContext text={r.matchedContext} query={query} />
                </pre>
              </div>
            ))}

            {results.length === 0 && (
              <p className="py-8 text-center text-sm text-(--text-muted)">
                No matches for &ldquo;{query}&rdquo;.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
