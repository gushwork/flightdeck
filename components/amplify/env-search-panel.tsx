"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import { amplifyHref } from "@/lib/amplify/page-url";
import type { AmplifySearchHit } from "@/lib/types";

function HighlightedContext({ text, query }: { text: string; query: string }) {
  if (!query) return <span>{text}</span>;

  const parts: { text: string; highlight: boolean }[] = [];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let cursor = 0;

  while (cursor < text.length) {
    const index = lower.indexOf(q, cursor);
    if (index === -1) {
      parts.push({ text: text.slice(cursor), highlight: false });
      break;
    }
    if (index > cursor) {
      parts.push({ text: text.slice(cursor, index), highlight: false });
    }
    parts.push({ text: text.slice(index, index + query.length), highlight: true });
    cursor = index + query.length;
  }

  return (
    <span>
      {parts.map((part, index) =>
        part.highlight ? (
          <mark
            key={index}
            className="rounded bg-(--accent-dim) px-0.5 text-(--accent)"
          >
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </span>
  );
}

export function EnvSearchPanel({ initialQuery = "" }: { initialQuery?: string }) {
  const { region, profile } = useAwsWorkspace();
  const router = useRouter();
  const searchedInitialQuery = useRef(false);
  const [query, setQuery] = useState(initialQuery);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [results, setResults] = useState<AmplifySearchHit[]>([]);
  const [appsScanned, setAppsScanned] = useState(0);
  const [branchRowsScanned, setBranchRowsScanned] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const doSearch = useCallback(
    async (rawQuery: string) => {
      const nextQuery = rawQuery.trim();
      if (!nextQuery) return;

      setLoading(true);
      setError(false);
      setHasSearched(true);
      setSearchedQuery(nextQuery);
      router.replace(amplifyHref({ mode: "search", q: nextQuery }));

      try {
        const response = await fetch("/api/amplify/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: nextQuery,
            region,
            profile: profile.trim() || undefined,
          }),
        });
        const data = (await response.json()) as {
          results?: AmplifySearchHit[];
          appsScanned?: number;
          branchRowsScanned?: number;
          elapsed?: number;
          error?: string;
        };
        if (!response.ok || data.error) throw new Error("Search failed");
        setResults(data.results ?? []);
        setAppsScanned(data.appsScanned ?? 0);
        setBranchRowsScanned(data.branchRowsScanned ?? 0);
        setElapsed(data.elapsed ?? 0);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [profile, region, router],
  );

  useEffect(() => {
    if (searchedInitialQuery.current || !initialQuery.trim()) return;
    searchedInitialQuery.current = true;
    void doSearch(initialQuery);
  }, [doSearch, initialQuery]);

  return (
    <section className="space-y-4" aria-label="Search Amplify environment variables">
      <p className="max-w-2xl text-sm text-(--text-secondary)">
        Search across all Amplify apps in this region for matching environment
        variable keys or values.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void doSearch(query);
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search keys and values…"
          className="w-full max-w-96 rounded-lg border border-(--border) bg-(--bg-field) px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-(--danger)/20 bg-(--danger-dim) px-4 py-3">
          <p className="flex-1 text-sm text-(--danger)">
            Couldn’t search env vars. Retry.
          </p>
          <button
            type="button"
            onClick={() => void doSearch(searchedQuery || query)}
            className="rounded-lg border border-(--danger)/20 px-3 py-1.5 text-xs font-medium text-(--danger) hover:bg-(--danger)/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
          >
            Retry
          </button>
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-4 shadow-sm">
          <div className="h-4 w-64 animate-pulse rounded bg-(--bg-muted)" />
        </div>
      )}

      {hasSearched && !loading && !error && (
        <>
          <div className="rounded-lg border border-(--accent)/20 bg-(--accent-dim) px-4 py-2.5 text-xs text-(--text-secondary)">
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
            {results.map((result, index) => (
              <div
                key={`${result.appId}-${result.scope}-${result.branchName ?? "app"}-${result.key}-${index}`}
                className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-4 shadow-sm transition-colors hover:bg-(--bg-hover)"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link
                    href={
                      result.scope === "branch" && result.branchName
                        ? `/amplify/${encodeURIComponent(result.appId)}?branch=${encodeURIComponent(result.branchName)}`
                        : `/amplify/${encodeURIComponent(result.appId)}`
                    }
                    className="font-medium text-(--accent) hover:underline"
                  >
                    {result.appName}
                  </Link>
                  <span className="font-(family-name:--font-mono) text-xs text-(--text-muted)">
                    {result.appId}
                  </span>
                  <span
                    className={`rounded-lg px-2 py-0.5 text-[11px] font-medium ${
                      result.scope === "app"
                        ? "bg-(--accent-dim) text-(--accent)"
                        : "bg-(--warn-dim) text-(--warn)"
                    }`}
                  >
                    {result.scope === "app" ? "App" : `Branch: ${result.branchName}`}
                  </span>
                  <span className="rounded bg-(--bg-muted) px-1.5 py-0.5 font-(family-name:--font-mono) text-[11px] text-(--text-secondary)">
                    {result.key}
                  </span>
                </div>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-(--bg-field) px-3 py-2 font-(family-name:--font-mono) text-xs text-(--text-secondary)">
                  <HighlightedContext
                    text={result.matchedContext}
                    query={searchedQuery}
                  />
                </pre>
              </div>
            ))}

            {results.length === 0 && (
              <p className="py-8 text-center text-sm text-(--text-muted)">
                No matches for &ldquo;{searchedQuery}&rdquo;.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
