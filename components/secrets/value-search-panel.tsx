"use client";

import { useCallback, useState } from "react";
import type { SecretSearchResult } from "@/lib/types";
import { BulkEditModal } from "@/components/secrets/bulk-edit-modal";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";

function envColor(env: string) {
  switch (env) {
    case "dev":
      return "bg-(--accent-dim) text-(--accent)";
    case "staging":
    case "stg":
      return "bg-(--warn-dim) text-(--warn)";
    case "prod":
    case "production":
      return "bg-(--danger-dim) text-(--danger)";
    default:
      return "bg-(--bg-surface) text-(--text-muted)";
  }
}

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

export function ValueSearchPanel({ initialQuery = "" }: { initialQuery?: string }) {
  const { region, profile } = useAwsWorkspace();
  const [query, setQuery] = useState(initialQuery);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [results, setResults] = useState<SecretSearchResult[]>([]);
  const [totalFetched, setTotalFetched] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  const doSearch = useCallback(async () => {
    const nextQuery = query.trim();
    if (!nextQuery) return;
    setLoading(true);
    setError(false);
    setHasSearched(true);
    setSearchedQuery(nextQuery);
    try {
      const response = await fetch("/api/secrets/values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: nextQuery,
          region,
          profile: profile.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error("Search failed");
      setResults(data.results);
      setTotalFetched(data.totalFetched);
      setElapsed(data.elapsed);
      setSelected(new Set());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [profile, query, region]);

  function toggleSelect(name: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <section className="space-y-4" aria-label="Search secret values">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void doSearch();
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search across all secret values..."
          className="w-full max-w-96 rounded-lg border border-(--border) bg-(--bg-field) px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
        <span className="rounded-lg bg-(--accent-dim) px-3 py-1 text-xs font-medium text-(--accent)">
          Search values ON
        </span>
      </form>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-(--danger)/20 bg-(--danger-dim) px-4 py-3">
          <p className="flex-1 text-sm text-(--danger)">Couldn’t search values. Retry.</p>
          <button
            type="button"
            onClick={() => void doSearch()}
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
            Fetched &amp; indexed{" "}
            <span className="font-(family-name:--font-mono) font-medium text-(--accent)">
              {totalFetched}
            </span>{" "}
            secrets in{" "}
            <span className="font-(family-name:--font-mono) font-medium text-(--accent)">
              {elapsed}s
            </span>{" "}
            — values held in-memory only, cleared on exit.
          </div>

          <div className="space-y-2">
            {results.map((result, index) => (
              <div
                key={`${result.arn}-${index}`}
                className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-4 shadow-sm transition-colors hover:bg-(--bg-hover)"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
                    checked={selected.has(result.name)}
                    onChange={() => toggleSelect(result.name)}
                  />
                  <span className="text-sm font-medium text-(--text-primary)">{result.name}</span>
                  <span className={`rounded-lg px-2 py-0.5 text-[11px] font-medium ${envColor(result.environment)}`}>
                    {result.environment}
                  </span>
                  <span className="rounded bg-(--bg-muted) px-1.5 py-0.5 text-[11px] text-(--text-secondary)">
                    {result.type}
                  </span>
                  {result.matchedKey && (
                    <span className="ml-auto text-[11px] text-(--text-muted)">
                      key: {result.matchedKey}
                    </span>
                  )}
                </div>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-(--bg-field) px-3 py-2 font-(family-name:--font-mono) text-xs text-(--text-secondary)">
                  <HighlightedContext text={result.matchedContext} query={searchedQuery} />
                </pre>
              </div>
            ))}

            {results.length === 0 && (
              <p className="py-8 text-center text-sm text-(--text-muted)">
                No matches found for &ldquo;{searchedQuery}&rdquo;.
              </p>
            )}
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-4 py-3 shadow-sm">
              <span className="text-xs text-(--text-secondary)">{selected.size} selected</span>
              <button
                type="button"
                onClick={() => setBulkEditOpen(true)}
                className="rounded-lg bg-(--accent) px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
              >
                Bulk Edit Selected
              </button>
            </div>
          )}
        </>
      )}

      <BulkEditModal
        selectedSecrets={Array.from(selected)}
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
      />
    </section>
  );
}
