"use client";

import { useState, useCallback } from "react";
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
    const idx = lower.indexOf(q, cursor);
    if (idx === -1) {
      parts.push({ text: text.slice(cursor), highlight: false });
      break;
    }
    if (idx > cursor) {
      parts.push({ text: text.slice(cursor, idx), highlight: false });
    }
    parts.push({ text: text.slice(idx, idx + query.length), highlight: true });
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

export default function ValueSearchPage() {
  const { region, profile } = useAwsWorkspace();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SecretSearchResult[]>([]);
  const [totalFetched, setTotalFetched] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  const doSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const res = await fetch("/api/secrets/values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          region,
          profile: profile.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results);
      setTotalFetched(data.totalFetched);
      setElapsed(data.elapsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [query, region, profile]);

  function toggleSelect(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="font-(family-name:--font-display) text-3xl text-(--text-primary)">
        Value Search
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          doSearch();
        }}
        className="flex items-center gap-3"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search across all secret values..."
          className="w-96 rounded-md border border-(--border) bg-(--bg-field) px-3 py-1.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-md bg-(--accent) px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
        </button>
        <span className="rounded-full bg-(--accent-dim) px-3 py-1 text-xs font-medium text-(--accent)">
          Search values ON
        </span>
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
            Fetching and indexing secrets... this may take a moment.
          </p>
        </div>
      )}

      {hasSearched && !loading && !error && (
        <>
          <div className="rounded-md border border-(--accent)/20 bg-(--accent-dim) px-4 py-2.5 text-xs text-(--text-secondary)">
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
            {results.map((r, i) => (
              <div
                key={`${r.arn}-${i}`}
                className="rounded-lg border border-(--border) bg-(--bg-card) p-3 transition-colors hover:bg-(--bg-hover)"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={selected.has(r.name)}
                    onChange={() => toggleSelect(r.name)}
                  />
                  <span className="text-sm font-medium text-(--text-primary)">
                    {r.name}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${envColor(r.environment)}`}
                  >
                    {r.environment}
                  </span>
                  <span className="rounded bg-(--bg-muted) px-1.5 py-0.5 text-[11px] text-(--text-secondary)">
                    {r.type}
                  </span>
                  {r.matchedKey && (
                    <span className="ml-auto text-[11px] text-(--text-muted)">
                      key: {r.matchedKey}
                    </span>
                  )}
                </div>
                <pre className="mt-2 rounded-md bg-(--bg-field) px-3 py-2 font-(family-name:--font-mono) text-xs text-(--text-secondary) overflow-x-auto">
                  <HighlightedContext text={r.matchedContext} query={query} />
                </pre>
              </div>
            ))}

            {results.length === 0 && (
              <p className="py-8 text-center text-sm text-(--text-muted)">
                No matches found for &ldquo;{query}&rdquo;.
              </p>
            )}
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-(--border) bg-(--bg-surface) px-4 py-2">
              <span className="text-xs text-(--text-secondary)">
                {selected.size} selected
              </span>
              <button
                onClick={() => setBulkEditOpen(true)}
                className="rounded-md bg-(--accent) px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
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
    </div>
  );
}
