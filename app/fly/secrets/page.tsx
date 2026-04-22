"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { FlyApp, FlySecret } from "@/lib/fly/types";
import {
  SearchableSelect,
  type SearchableOption,
} from "@/components/searchable-select";
import { FlySecretsBulkPanel } from "@/components/fly/fly-secrets-bulk-panel";

// ─── Inline add-row form ──────────────────────────────────────────────────────

function AddSecretRow({
  onAdd,
  busy,
}: {
  onAdd: (name: string, value: string) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed, value);
    setName("");
    setValue("");
  };

  return (
    <tr className="border-t border-(--border-hairline)">
      <td className="px-4 py-2">
        <input
          type="text"
          placeholder="SECRET_NAME"
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
          className="w-full rounded-lg border border-(--border) bg-(--bg-field) px-2.5 py-1.5 font-(family-name:--font-mono) text-xs text-(--text-primary) outline-none focus:border-(--accent) focus:ring-1 focus:ring-(--accent)/30"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="password"
          placeholder="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-lg border border-(--border) bg-(--bg-field) px-2.5 py-1.5 font-(family-name:--font-mono) text-xs text-(--text-primary) outline-none focus:border-(--accent) focus:ring-1 focus:ring-(--accent)/30"
        />
      </td>
      <td className="px-4 py-2" colSpan={2}>
        <button
          type="button"
          disabled={!name.trim() || busy}
          onClick={submit}
          className="rounded-lg bg-(--accent) px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Set
        </button>
      </td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FlySecretsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialApp = searchParams.get("app") ?? "";

  const [selectedApp, setSelectedApp] = useState(initialApp);
  const [apps, setApps] = useState<FlyApp[]>([]);
  const [secrets, setSecrets] = useState<FlySecret[]>([]);
  const [loading, setLoading] = useState(false);
  const [appsLoading, setAppsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmUnset, setConfirmUnset] = useState<string | null>(null);

  // Load app list
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/fly/apps");
        const data = await res.json();
        setApps(data.apps ?? []);
      } catch {
        // non-fatal — user can still type an app name
      } finally {
        setAppsLoading(false);
      }
    })();
  }, []);

  // Load secrets whenever app changes
  const loadSecrets = useCallback(async () => {
    if (!selectedApp) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/fly/apps/${encodeURIComponent(selectedApp)}/secrets`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSecrets(data.secrets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedApp]);

  useEffect(() => { loadSecrets(); }, [loadSecrets]);

  const handleAppChange = (name: string) => {
    setSelectedApp(name);
    setSecrets([]);
    setError(null);
    setConfirmUnset(null);
    router.replace(`/fly/secrets?app=${encodeURIComponent(name)}`, { scroll: false });
  };

  const handleSet = async (name: string, value: string) => {
    if (!selectedApp) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/fly/apps/${encodeURIComponent(selectedApp)}/secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set: { [name]: value } }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSecrets(data.secrets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleUnset = async (name: string) => {
    if (!selectedApp) return;
    setBusy(true);
    setConfirmUnset(null);
    try {
      const res = await fetch(`/api/fly/apps/${encodeURIComponent(selectedApp)}/secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unset: [name] }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSecrets(data.secrets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleBulkSet = async (map: Record<string, string>) => {
    if (!selectedApp) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/fly/apps/${encodeURIComponent(selectedApp)}/secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set: map }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSecrets(data.secrets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const appOptions: SearchableOption[] = apps.map((a) => ({
    value: a.name,
    label: a.name,
    keywords: [a.org, a.orgSlug],
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--success)">
          Fly.io
        </p>
        <h1 className="mt-2 font-(family-name:--font-display) text-2xl font-medium tracking-tight text-(--text-primary)">
          Secrets
        </h1>
        <p className="mt-2 text-sm text-(--text-secondary)">
          Encrypted runtime environment variables for your Fly apps. Values are write-only — the CLI never exposes them.
        </p>
      </header>

      {/* App picker */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-(--text-secondary)">App</label>
        <SearchableSelect
          value={selectedApp}
          onValueChange={handleAppChange}
          options={appOptions}
          placeholder={appsLoading ? "Loading apps…" : "Select an app"}
          searchPlaceholder="Search apps…"
          emptyText="No apps found"
          disabled={appsLoading}
          className="min-w-[240px]"
          variant="panel"
        />
        {selectedApp && (
          <button
            type="button"
            onClick={loadSecrets}
            disabled={loading}
            className="rounded-lg border border-(--border-hairline) bg-(--bg-elevated) px-3 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:border-(--accent)/40 hover:text-(--accent) disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-(--danger)/30 bg-(--danger)/5 px-4 py-3 text-sm text-(--danger)">
          {error}
        </div>
      )}

      {/* Bulk set panel */}
      {selectedApp && (
        <FlySecretsBulkPanel onApply={handleBulkSet} disabled={busy} />
      )}

      {/* Secrets table */}
      {selectedApp && (
        <div className="overflow-hidden rounded-xl border border-(--border-hairline) bg-(--bg-elevated) shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-(--border-hairline) bg-(--bg-field)">
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-(--text-muted)">
                  Name
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-(--text-muted)">
                  Digest
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-(--text-muted)">
                  Status
                </th>
                <th className="w-[80px] px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && secrets.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-(--text-muted)">
                    Loading secrets…
                  </td>
                </tr>
              ) : secrets.length === 0 && !loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-(--text-muted)">
                    No secrets set for {selectedApp}.
                  </td>
                </tr>
              ) : (
                secrets.map((s) => (
                  <tr
                    key={s.name}
                    className="border-t border-(--border-hairline) transition-colors hover:bg-(--bg-hover)"
                  >
                    <td className="px-4 py-2.5 font-(family-name:--font-mono) text-xs font-medium text-(--text-primary)">
                      {s.name}
                    </td>
                    <td className="px-4 py-2.5 font-(family-name:--font-mono) text-xs text-(--text-muted)">
                      {s.digest}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          s.status === "Deployed"
                            ? "bg-(--success-muted) text-(--success)"
                            : s.status === "Staged"
                              ? "bg-(--warn-muted) text-(--warn)"
                              : "bg-(--bg-muted) text-(--text-muted)"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {confirmUnset === s.name ? (
                        <span className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleUnset(s.name)}
                            className="rounded-lg bg-(--danger) px-2 py-1 text-[11px] font-semibold text-white hover:bg-(--danger)/90 disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmUnset(null)}
                            className="text-[11px] text-(--text-muted) hover:text-(--text-primary)"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmUnset(s.name)}
                          className="text-[11px] font-medium text-(--danger)/70 hover:text-(--danger) disabled:opacity-50"
                        >
                          Unset
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
              <AddSecretRow onAdd={handleSet} busy={busy} />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
