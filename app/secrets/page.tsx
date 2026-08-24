"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useData } from "@/lib/context/data-provider";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import { relativeTime, daysSince } from "@/lib/utils";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FloatingActionBar } from "@/components/floating-action-bar";
import { InsightsPanel } from "@/components/secrets/insights-panel";
import { ValueSearchPanel } from "@/components/secrets/value-search-panel";
import type { SecretEntry } from "@/lib/types";
import { parseEnvFile } from "@/lib/secret-value-format";
import {
  parseSecretsBrowseFilter,
  parseSecretsMode,
  secretsHref,
  type SecretsBrowseFilter,
} from "@/lib/secrets/page-url";
import {
  isSecretStale,
  secretsHygieneStats,
  STALE_DAYS,
} from "@/lib/dashboard/exceptions";

function deriveEnv(secret: SecretEntry): string {
  if (secret.tags.Environment) return secret.tags.Environment.toLowerCase();
  const first = secret.name.split("/")[0]?.toLowerCase();
  if (["dev", "staging", "stg", "prod", "production", "shared"].includes(first)) {
    if (first === "production") return "prod";
    if (first === "stg") return "staging";
    return first;
  }
  return "unknown";
}

function deriveType(secret: SecretEntry): string {
  if (secret.tags.SecretType) return secret.tags.SecretType;
  const parts = secret.name.split("/");
  return parts[2] ?? parts[1] ?? "general";
}

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

function normalizeSecretTags(rows: { key: string; value: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const k = row.key.trim();
    if (!k) continue;
    out[k] = row.value.trim();
  }
  return out;
}

function jsonObjectToStringRecord(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

function CreateSecretModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { region, profile } = useAwsWorkspace();
  const { refreshSecrets } = useData();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [envImportStatus, setEnvImportStatus] = useState<string | null>(null);
  const [tagRows, setTagRows] = useState<{ key: string; value: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setValue("");
    setDescription("");
    setEnvImportStatus(null);
    setTagRows([]);
    setSubmitError(null);
  }, [open]);

  if (!open) return null;

  function addTagRow() {
    setTagRows((prev) => [...prev, { key: "", value: "" }]);
  }

  function removeTagRow(index: number) {
    setTagRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateTagRow(index: number, field: "key" | "value", next: string) {
    setTagRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: next } : row)),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tags = normalizeSecretTags(tagRows);
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/secrets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          secretString: value,
          description: description.trim() || undefined,
          tags: Object.keys(tags).length > 0 ? tags : undefined,
          region,
          profile: profile.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setSubmitError(data.error ?? "Failed to create secret");
        return;
      }
      await refreshSecrets();
      setName("");
      setValue("");
      setDescription("");
      setEnvImportStatus(null);
      setTagRows([]);
      onClose();
    } catch {
      setSubmitError("Request failed. Check your network and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEnvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const parsed = parseEnvFile(await file.text());
      const keys = Object.keys(parsed);

      if (keys.length === 0) {
        setEnvImportStatus("No key/value pairs found in the selected .env file.");
        return;
      }

      setValue(JSON.stringify(parsed, null, 2));
      setEnvImportStatus(
        `Imported ${keys.length} variable${keys.length > 1 ? "s" : ""} from ${file.name}.`,
      );
    } catch {
      setEnvImportStatus("Could not parse the selected .env file.");
    } finally {
      e.target.value = "";
    }
  }

  function handleValuePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;

    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        JSON.parse(trimmed);
        return;
      } catch {
        /* not valid JSON — may still be .env */
      }
    }

    const parsed = parseEnvFile(text);
    const keys = Object.keys(parsed);
    if (keys.length === 0) return;

    const current = value;
    const currentTrim = current.trim();
    let merged: Record<string, string>;

    if (!currentTrim) {
      merged = { ...parsed };
    } else {
      try {
        const j = JSON.parse(currentTrim);
        if (j !== null && typeof j === "object" && !Array.isArray(j)) {
          merged = {
            ...jsonObjectToStringRecord(j as Record<string, unknown>),
            ...parsed,
          };
        } else {
          return;
        }
      } catch {
        const existingEnv = parseEnvFile(current);
        if (Object.keys(existingEnv).length > 0) {
          merged = { ...existingEnv, ...parsed };
        } else {
          return;
        }
      }
    }

    e.preventDefault();
    setValue(JSON.stringify(merged, null, 2));
    setEnvImportStatus(
      `Imported ${keys.length} variable${keys.length > 1 ? "s" : ""} from pasted .env content.`,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-(--border) bg-(--bg-field) p-6 shadow-sm">
        <h3 className="text-base font-semibold text-(--text-primary)">
          Create Secret
        </h3>
        {submitError && (
          <p className="mt-3 rounded-md border border-(--danger)/25 bg-(--danger-muted) px-3 py-2 text-sm text-(--danger)">
            {submitError}
          </p>
        )}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-(--text-secondary)">
              Name <span className="text-(--danger)">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. prod/api/stripe-key"
              className="w-full rounded-md border border-(--border) bg-(--bg-surface) px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-(--text-secondary)">
              Value <span className="text-(--danger)">*</span>
            </label>
            <textarea
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onPaste={handleValuePaste}
              rows={4}
              placeholder="Secret value, JSON, or paste a full .env file…"
              className="w-full rounded-md border border-(--border) bg-(--bg-surface) px-3 py-2 font-(family-name:--font-mono) text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus:outline-none"
            />
            <div className="mt-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-(--text-secondary)">
                <input
                  type="file"
                  accept=".env,text/plain"
                  onChange={handleEnvUpload}
                  className="block text-xs file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-(--bg-surface) file:px-2 file:py-1 file:text-xs file:text-(--text-secondary) hover:file:bg-(--bg-hover)"
                />
                Import from .env
              </label>
              {envImportStatus && (
                <p className="mt-1 text-xs text-(--text-muted)">{envImportStatus}</p>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-(--text-secondary)">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full rounded-md border border-(--border) bg-(--bg-surface) px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus:outline-none"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-(--text-secondary)">
                Tags
              </label>
              <button
                type="button"
                onClick={addTagRow}
                className="text-xs font-medium text-(--accent) transition-colors hover:underline"
              >
                Add tag
              </button>
            </div>
            <p className="mb-2 text-[11px] text-(--text-muted)">
              Optional key/value pairs for AWS Secrets Manager resource tags (e.g.{" "}
              <span className="font-(family-name:--font-mono)">Environment</span>,{" "}
              <span className="font-(family-name:--font-mono)">SecretType</span>).
            </p>
            {tagRows.length === 0 ? (
              <p className="rounded-md border border-dashed border-(--border) bg-(--bg-surface) px-3 py-2 text-xs text-(--text-muted)">
                No tags yet. Click &quot;Add tag&quot; to add one.
              </p>
            ) : (
              <div className="space-y-2">
                {tagRows.map((row, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={row.key}
                      onChange={(e) => updateTagRow(index, "key", e.target.value)}
                      placeholder="Key"
                      className="min-w-0 flex-1 rounded-md border border-(--border) bg-(--bg-surface) px-2 py-1.5 font-(family-name:--font-mono) text-xs text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus:outline-none"
                    />
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) => updateTagRow(index, "value", e.target.value)}
                      placeholder="Value"
                      className="min-w-0 flex-1 rounded-md border border-(--border) bg-(--bg-surface) px-2 py-1.5 font-(family-name:--font-mono) text-xs text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeTagRow(index)}
                      className="shrink-0 rounded-md border border-(--border) px-2 py-1.5 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-hover)"
                      title="Remove tag"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border border-(--border) bg-(--bg-surface) px-4 py-1.5 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-hover) disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-(--accent) px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SecretsPageContent() {
  const { region, profile } = useAwsWorkspace();
  const { secrets, secretsLoading: loading, secretsError: error, refreshSecrets: refresh, loadSecrets } = useData();

  useEffect(() => { loadSecrets(); }, [loadSecrets]);
  const router = useRouter();
  const params = useSearchParams();
  const mode = parseSecretsMode(params.get("mode"));
  const filter = parseSecretsBrowseFilter(params.get("filter"));
  const lastBrowseFilter = useRef<SecretsBrowseFilter>(filter);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copiedArn, setCopiedArn] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    if (mode === "browse") lastBrowseFilter.current = filter;
  }, [filter, mode]);

  const handleFilter = useCallback(
    (nextFilter: SecretsBrowseFilter) => {
      lastBrowseFilter.current = nextFilter;
      router.replace(secretsHref({ filter: nextFilter }));
    },
    [router],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "R" && event.shiftKey) {
        const target = event.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
        event.preventDefault();
        void refresh();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [refresh]);

  const insights = useMemo(() => {
    const stats = secretsHygieneStats(secrets, nowMs);
    const rotationEnabled = secrets.filter((secret) => secret.rotationEnabled).length;
    const rotationPct = secrets.length > 0 ? (rotationEnabled / secrets.length) * 100 : 0;
    const staleNames = secrets
      .filter((secret) => isSecretStale(secret, nowMs))
      .map((secret) => ({
        name: secret.name,
        days: daysSince(secret.lastAccessedDate!),
      }))
      .sort((a, b) => b.days - a.days)
      .slice(0, 8);

    return {
      rotationPct,
      staleNames,
      staleCount: stats.stale,
      unrotatedCount: stats.unrotated,
    };
  }, [nowMs, secrets]);

  const filtered = useMemo(() => {
    let list = secrets;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description ?? "").toLowerCase().includes(q) ||
          Object.entries(s.tags).some(
            ([k, v]) =>
              k.toLowerCase().includes(q) || v.toLowerCase().includes(q),
          ),
      );
    }

    switch (filter) {
      case "dev":
        list = list.filter((s) => deriveEnv(s) === "dev");
        break;
      case "staging":
        list = list.filter((s) => {
          const env = deriveEnv(s);
          return env === "staging" || env === "stg";
        });
        break;
      case "prod":
        list = list.filter((s) => {
          const env = deriveEnv(s);
          return env === "prod" || env === "production";
        });
        break;
      case "no-rotation":
        list = list.filter((s) => !s.rotationEnabled);
        break;
      case "stale":
        list = list.filter((s) => isSecretStale(s, nowMs));
        break;
    }

    return list;
  }, [secrets, search, filter, nowMs]);

  function toggleSelect(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((s) => s.name)));
    }
  }

  async function copyArn(arn: string) {
    try {
      await navigator.clipboard.writeText(arn);
      setCopiedArn(arn);
      setTimeout(() => setCopiedArn(null), 1500);
    } catch {
      /* clipboard may be blocked */
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/secrets/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secretNames: deleteTarget,
          region,
          profile: profile.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSelected(new Set());
      setDeleteTarget(null);
      refresh();
    } catch {
      /* errors shown in API response */
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-32">
        <p className="animate-pulse text-sm text-(--text-muted)">
          Loading secrets...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center py-32">
        <div className="rounded-lg border border-(--danger)/20 bg-(--danger-dim) px-6 py-5 text-center">
          <p className="text-sm text-(--danger)">{error}</p>
          <button
            onClick={refresh}
            className="mt-3 rounded-md bg-(--danger) px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const filters: { key: SecretsBrowseFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "dev", label: "dev" },
    { key: "staging", label: "staging" },
    { key: "prod", label: "prod" },
    { key: "no-rotation", label: "No Rotation" },
    { key: "stale", label: `Stale >${STALE_DAYS}d` },
  ];

  return (
    <div className="space-y-4">
      <h1 className="font-(family-name:--font-display) text-2xl font-medium text-(--text-primary)">
        Secrets Manager
        <span className="ml-2 font-(family-name:--font-mono) text-base text-(--text-muted)">
          ({secrets.length})
        </span>
      </h1>

      <div className="sticky top-0 z-10 -mx-8 flex flex-wrap items-center gap-3 border-b border-(--border-hairline) bg-(--bg-deep)/90 px-8 py-3 backdrop-blur-sm">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search secrets..."
          className="w-64 rounded-lg border border-(--border) bg-(--bg-field) px-3 py-1.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
        />
        {mode === "browse" && (
          <div className="flex flex-wrap gap-1">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => handleFilter(f.key)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 ${
                  filter === f.key
                    ? "bg-(--accent) text-white"
                    : "bg-(--bg-surface) text-(--text-secondary) hover:bg-(--bg-hover)"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              router.replace(
                mode === "values"
                  ? secretsHref({ filter: lastBrowseFilter.current })
                  : secretsHref({ mode: "values" }),
              )
            }
            className="rounded-lg border border-(--accent) px-3 py-1.5 text-xs font-medium text-(--accent) transition-colors hover:bg-(--accent-dim) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
          >
            {mode === "values" ? "Browse" : "Search values"}
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-(--accent) px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M8 3v10M3 8h10" />
            </svg>
            Create
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            title="Refresh (Shift+R)"
            className="rounded-lg border border-(--border) bg-(--bg-elevated) px-3 py-1.5 text-xs font-medium text-(--text-secondary) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <InsightsPanel
        total={secrets.length}
        rotationPct={insights.rotationPct}
        staleCount={insights.staleCount}
        unrotatedCount={insights.unrotatedCount}
        staleNames={insights.staleNames}
        filter={filter}
        onFilter={handleFilter}
      />

      {mode === "browse" ? (
        <>
      <div className="overflow-x-auto rounded-xl border border-(--border) bg-(--bg-field)">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--border) bg-(--bg-surface)">
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
                Name
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
                Env
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
                Type
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
                Last Rotated
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
                Last Accessed
              </th>
              <th className="w-20 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((secret) => {
              const env = deriveEnv(secret);
              const type = deriveType(secret);
              const rotatedWarn = !secret.lastRotatedDate;
              const accessedDays = secret.lastAccessedDate
                ? daysSince(secret.lastAccessedDate)
                : null;

              return (
                <tr
                  key={secret.arn}
                  onClick={() =>
                    router.push(
                      `/secrets/${encodeURIComponent(secret.name)}`,
                    )
                  }
                  className="group cursor-pointer border-b border-(--border) transition-colors hover:bg-(--bg-hover)"
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selected.has(secret.name)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleSelect(secret.name)}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-(--text-primary)">
                    {secret.name}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${envColor(env)}`}
                    >
                      {env}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-(--bg-muted) px-1.5 py-0.5 text-[11px] text-(--text-secondary)">
                      {type}
                    </span>
                  </td>
                  <td
                    className={`px-3 py-2 text-xs ${rotatedWarn ? "text-(--warn)" : "text-(--text-secondary)"}`}
                  >
                    {secret.lastRotatedDate
                      ? relativeTime(secret.lastRotatedDate)
                      : "Never"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(
                          `/secrets/${encodeURIComponent(secret.name)}?tab=history`,
                        );
                      }}
                      className={`text-xs underline decoration-dotted underline-offset-2 transition-colors hover:text-(--accent) ${
                        accessedDays !== null && accessedDays > 180
                          ? "text-(--warn)"
                          : "text-(--text-secondary)"
                      }`}
                      title="View access history"
                    >
                      {secret.lastAccessedDate
                        ? relativeTime(secret.lastAccessedDate)
                        : "Never"}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <span className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyArn(secret.arn);
                          }}
                          className="rounded p-1 text-(--text-muted) opacity-0 transition-all hover:bg-(--accent-dim) hover:text-(--accent) group-hover:opacity-100"
                          title="Copy ARN"
                        >
                          {copiedArn === secret.arn ? (
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3.5 8.5l3 3 6-7" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="5" y="5" width="8" height="8" rx="1" />
                              <path d="M3 11V3a1 1 0 0 1 1-1h8" />
                            </svg>
                          )}
                        </button>
                        {copiedArn === secret.arn && (
                          <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-(--text-primary) px-2 py-0.5 text-[10px] font-medium text-(--bg-deep)">
                            Copied!
                          </span>
                        )}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget([secret.name]);
                        }}
                        className="rounded p-1 text-(--text-muted) opacity-0 transition-all hover:bg-(--danger-dim) hover:text-(--danger) group-hover:opacity-100"
                        title="Delete secret"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2.5 4.5h11M5.5 4.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5M6.5 7v4.5M9.5 7v4.5M3.5 4.5l.5 8.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l.5-8.5" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-sm text-(--text-muted)"
                >
                  No secrets found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <FloatingActionBar
        count={selected.size}
        actions={[
          {
            label: "Delete selected",
            variant: "danger",
            onClick: () => setDeleteTarget([...selected]),
          },
          {
            label: "Bulk Edit",
            variant: "accent",
            onClick: () => router.push(secretsHref({ mode: "values" })),
          },
        ]}
        onClear={() => setSelected(new Set())}
      />
        </>
      ) : (
        <ValueSearchPanel initialQuery={params.get("q") ?? ""} />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.length === 1 ? "secret" : `${deleteTarget?.length} secrets`}?`}
        message="Secrets will be scheduled for deletion with a 30-day recovery window. You can restore them during this period."
        detail={deleteTarget?.join("\n")}
        confirmLabel={`Delete ${deleteTarget?.length === 1 ? "1 secret" : `${deleteTarget?.length} secrets`}`}
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />

      <CreateSecretModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}

export default function SecretsPage() {
  return (
    <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-(--bg-muted)" />}>
      <SecretsPageContent />
    </Suspense>
  );
}
