"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  GHRepoSecretsCockpit,
  GHSecretInventoryRow,
  GHSecretMutationAction,
} from "@/lib/github/secrets-types";
import { SecretsMutationForm } from "./mutation-form";

type Tab = "repository" | "environments" | "org";

function RowActions({
  row,
  onComplete,
}: {
  row: GHSecretInventoryRow;
  onComplete: () => void;
}) {
  const [action, setAction] = useState<GHSecretMutationAction | null>(null);

  const target = {
    platform: row.platform,
    scope: row.scope,
    ownerLogin: row.ownerLogin,
    repoFullName: row.repoFullName,
    environmentName: row.environmentName,
    name: row.name,
  };

  if (action) {
    return (
      <div className="mt-2 rounded-lg border border-(--border-hairline) bg-(--bg-field) p-3">
        <SecretsMutationForm
          target={target}
          action={action}
          onComplete={() => {
            setAction(null);
            onComplete();
          }}
        />
        <button
          type="button"
          onClick={() => setAction(null)}
          className="mt-2 text-xs text-(--text-muted) hover:text-(--text-primary)"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() =>
          setAction(row.kind === "secret" ? "set-secret" : "set-variable")
        }
        className="text-[11px] text-(--accent) hover:underline"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() =>
          setAction(row.kind === "secret" ? "delete-secret" : "delete-variable")
        }
        className="text-[11px] text-(--danger) hover:underline"
      >
        Delete
      </button>
    </div>
  );
}

function SecretList({
  rows,
  onMutated,
}: {
  rows: GHSecretInventoryRow[];
  onMutated: () => void;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-(--text-muted)">None</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li
          key={`${row.kind}-${row.name}`}
          className="rounded-lg border border-(--border-hairline) px-3 py-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-(family-name:--font-mono) text-xs font-medium">
              {row.name}
            </span>
            <span className="text-[10px] text-(--text-faint)">{row.kind}</span>
          </div>
          {row.kind === "variable" && row.value !== undefined && (
            <p className="mt-1 truncate font-(family-name:--font-mono) text-[11px] text-(--text-secondary)">
              {row.value}
            </p>
          )}
          <RowActions row={row} onComplete={onMutated} />
        </li>
      ))}
    </ul>
  );
}

export function SecretsRepoDrawer({
  repoFullName,
  open,
  onClose,
  onMutated,
}: {
  repoFullName: string | null;
  open: boolean;
  onClose: () => void;
  onMutated?: () => void;
}) {
  const [cockpit, setCockpit] = useState<GHRepoSecretsCockpit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("repository");

  const load = useCallback(async () => {
    if (!repoFullName) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/github/secrets/repo?fullName=${encodeURIComponent(repoFullName)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load repo");
      setCockpit(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repo");
    } finally {
      setLoading(false);
    }
  }, [repoFullName]);

  useEffect(() => {
    if (open && repoFullName) {
      void load();
      setTab("repository");
    }
  }, [open, repoFullName, load]);

  const handleMutated = () => {
    void load();
    onMutated?.();
  };

  if (!open || !repoFullName) return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "repository", label: "Repository" },
    { id: "environments", label: "Environments" },
    { id: "org", label: "Org inheritance" },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-(--border-hairline) bg-(--bg-elevated) shadow-sm">
        <div className="flex items-center justify-between border-b border-(--border-hairline) px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-(--text-primary)">{repoFullName}</h2>
            <p className="text-xs text-(--text-muted)">Secrets cockpit</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xs text-(--text-muted) hover:bg-(--bg-hover)"
          >
            Close
          </button>
        </div>

        <div className="flex gap-1 border-b border-(--border-hairline) px-5 py-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? "rounded-lg bg-(--accent-muted) px-3 py-1.5 text-xs font-medium text-(--accent)"
                  : "rounded-lg px-3 py-1.5 text-xs text-(--text-secondary) hover:bg-(--bg-hover)"
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && <p className="text-xs text-(--text-muted)">Loading…</p>}
          {error && <p className="text-xs text-(--danger)">{error}</p>}
          {cockpit && !loading && (
            <>
              {tab === "repository" && (
                <div className="flex flex-col gap-4">
                  <section>
                    <h3 className="mb-2 text-xs font-semibold text-(--text-secondary)">Secrets</h3>
                    <SecretList rows={cockpit.repository.secrets} onMutated={handleMutated} />
                  </section>
                  <section>
                    <h3 className="mb-2 text-xs font-semibold text-(--text-secondary)">Variables</h3>
                    <SecretList rows={cockpit.repository.variables} onMutated={handleMutated} />
                  </section>
                </div>
              )}
              {tab === "environments" && (
                <div className="flex flex-col gap-4">
                  {cockpit.environments.length === 0 ? (
                    <p className="text-xs text-(--text-muted)">No environments</p>
                  ) : (
                    cockpit.environments.map((env) => (
                      <section key={env.name}>
                        <h3 className="mb-2 font-(family-name:--font-mono) text-xs font-semibold text-(--text-primary)">
                          {env.name}
                        </h3>
                        <SecretList
                          rows={[...env.secrets, ...env.variables]}
                          onMutated={handleMutated}
                        />
                      </section>
                    ))
                  )}
                </div>
              )}
              {tab === "org" && (
                <div className="flex flex-col gap-4">
                  {cockpit.inheritedOrg.length === 0 ? (
                    <p className="text-xs text-(--text-muted)">No inherited org secrets</p>
                  ) : (
                    cockpit.inheritedOrg.map((org) => (
                      <section key={org.orgLogin}>
                        <h3 className="mb-2 text-xs font-semibold">{org.orgLogin}</h3>
                        <SecretList
                          rows={[...org.secrets, ...org.variables]}
                          onMutated={handleMutated}
                        />
                      </section>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
