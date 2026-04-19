"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useData } from "@/lib/context/data-provider";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import { workspaceSearchParams } from "@/lib/aws/workspace-query";
import { relativeTime } from "@/lib/utils";
import type { SecretValue } from "@/lib/types";
import type { AccessEvent } from "@/lib/aws/cloudtrail";
import { SecretValueEditor } from "@/components/secrets/secret-value-editor";

type Tab = "value" | "versions" | "history" | "rotation" | "policy";

interface VersionEntry {
  versionId: string;
  versionStages: string[];
  createdDate: string;
}

const SENSITIVE_KEYS = ["password", "secret", "token", "key", "credential"];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => lower.includes(s));
}

function JsonViewer({
  data,
  revealedKeys,
  onToggleReveal,
}: {
  data: Record<string, unknown>;
  revealedKeys: Set<string>;
  onToggleReveal: (key: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      <span className="text-(--text-muted)">{"{"}</span>
      {Object.entries(data).map(([key, value], i, arr) => {
        const masked = isSensitiveKey(key) && !revealedKeys.has(key);
        const displayValue = masked
          ? "••••••••••••"
          : JSON.stringify(value);

        return (
          <div key={key} className="flex items-center gap-1 pl-4">
            <span className="text-(--accent)">&quot;{key}&quot;</span>
            <span className="text-(--text-muted)">:</span>{" "}
            <span
              className={
                masked
                  ? "text-(--text-muted)"
                  : typeof value === "string"
                    ? "text-(--success)"
                    : "text-(--warn)"
              }
            >
              {displayValue}
            </span>
            {i < arr.length - 1 && (
              <span className="text-(--text-muted)">,</span>
            )}
            {isSensitiveKey(key) && (
              <button
                onClick={() => onToggleReveal(key)}
                className="ml-2 rounded bg-(--bg-surface) px-1.5 py-0.5 text-[10px] text-(--accent) transition-colors hover:bg-(--accent-dim)"
              >
                {masked ? "Reveal" : "Hide"}
              </button>
            )}
          </div>
        );
      })}
      <span className="text-(--text-muted)">{"}"}</span>
    </div>
  );
}

export default function SecretDetailPage() {
  const params = useParams<{ id: string }>();
  const secretId = decodeURIComponent(params.id);
  const { region, profile } = useAwsWorkspace();
  const { secrets, loadSecrets, refreshSecrets, secretsLoading } = useData();

  useEffect(() => { loadSecrets(); }, [loadSecrets]);

  const [tab, setTab] = useState<Tab>("value");
  const [value, setValue] = useState<SecretValue | null>(null);
  const [valueLoading, setValueLoading] = useState(false);
  const [valueError, setValueError] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [arnCopied, setArnCopied] = useState(false);
  const [editingValue, setEditingValue] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<AccessEvent[]>([]);
  const [historyNextToken, setHistoryNextToken] = useState<string | undefined>();
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const historyFetched = useRef(false);

  const meta = (secrets ?? []).find((s) => s.name === secretId);
  const secretArn = meta?.arn ?? value?.arn;

  const fetchValue = useCallback(async () => {
    setValueLoading(true);
    setValueError(null);
    try {
      const encodedId = encodeURIComponent(secretId);
      const q = workspaceSearchParams(region, profile).toString();
      const res = await fetch(`/api/secrets/${encodedId}?${q}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setValue(data.value);
    } catch (e) {
      setValueError(e instanceof Error ? e.message : "Failed to load value");
    } finally {
      setValueLoading(false);
    }
  }, [secretId, region, profile]);

  const fetchVersions = useCallback(async () => {
    setVersionsLoading(true);
    try {
      const encodedId = encodeURIComponent(secretId);
      const q = workspaceSearchParams(region, profile).toString();
      const res = await fetch(`/api/secrets/${encodedId}/versions?${q}`);
      const data = await res.json();
      if (!data.error) setVersions(data.versions);
    } catch { /* ignore */ } finally {
      setVersionsLoading(false);
    }
  }, [secretId, region, profile]);

  const fetchHistory = useCallback(
    async (token?: string) => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const encodedId = encodeURIComponent(secretId);
        const params = workspaceSearchParams(region, profile);
        if (token) params.set("nextToken", token);
        const res = await fetch(
          `/api/secrets/${encodedId}/history?${params}`,
        );
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setHistoryEvents((prev) =>
          token ? [...prev, ...data.events] : data.events,
        );
        setHistoryNextToken(data.nextToken);
      } catch (e) {
        setHistoryError(
          e instanceof Error ? e.message : "Failed to load access history",
        );
      } finally {
        setHistoryLoading(false);
      }
    },
    [secretId, region, profile],
  );

  useEffect(() => {
    historyFetched.current = false;
    setHistoryEvents([]);
    setHistoryNextToken(undefined);
  }, [region, profile]);

  useEffect(() => {
    if (tab === "value") fetchValue();
    if (tab === "versions") fetchVersions();
    if (tab === "history" && !historyFetched.current) {
      historyFetched.current = true;
      fetchHistory();
    }
  }, [tab, region, profile, fetchValue, fetchVersions, fetchHistory]);

  useEffect(() => {
    if (tab !== "value") setEditingValue(false);
  }, [tab]);

  function toggleReveal(key: string) {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function copyValue() {
    if (!value?.secretString) return;
    await navigator.clipboard.writeText(value.secretString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyArn() {
    if (!secretArn) return;
    try {
      await navigator.clipboard.writeText(secretArn);
      setArnCopied(true);
      setTimeout(() => setArnCopied(false), 1500);
    } catch {
      /* clipboard may be blocked */
    }
  }

  async function saveSecretValue(next: string) {
    const encodedId = encodeURIComponent(secretId);
    const q = workspaceSearchParams(region, profile).toString();
    const res = await fetch(`/api/secrets/${encodedId}?${q}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secretString: next }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setEditingValue(false);
    await fetchValue();
    await refreshSecrets();
  }

  let parsedJson: Record<string, unknown> | null = null;
  if (value?.secretString) {
    try {
      const parsed = JSON.parse(value.secretString);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        parsedJson = parsed as Record<string, unknown>;
      }
    } catch { /* not JSON */ }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "value", label: "Value" },
    { key: "versions", label: "Versions" },
    { key: "history", label: "Access History" },
    { key: "rotation", label: "Rotation" },
    { key: "policy", label: "Policy" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-(family-name:--font-display) text-2xl text-(--text-primary)">
          {secretId}
        </h1>
        {meta && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-(--text-secondary)">
            <span>
              Created{" "}
              <span className="text-(--text-primary)">
                {relativeTime(meta.createdDate)}
              </span>
            </span>
            {meta.lastChangedDate && (
              <span>
                Changed{" "}
                <span className="text-(--text-primary)">
                  {relativeTime(meta.lastChangedDate)}
                </span>
              </span>
            )}
            {meta.lastAccessedDate && (
              <span>
                Accessed{" "}
                <span className="text-(--text-primary)">
                  {relativeTime(meta.lastAccessedDate)}
                </span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <span
                className={`inline-block h-2 w-2 rounded-full ${meta.rotationEnabled ? "bg-(--success)" : "bg-(--warn)"}`}
              />
              Rotation {meta.rotationEnabled ? "enabled" : "disabled"}
            </span>
          </div>
        )}
        {meta && Object.keys(meta.tags).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {Object.entries(meta.tags).map(([k, v]) => (
              <span
                key={k}
                className="rounded-full bg-(--bg-surface) px-2 py-0.5 text-[11px] text-(--text-secondary)"
              >
                {k}={v}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 rounded-lg border border-(--border) bg-(--bg-card) p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
            Details
          </h2>
          {secretArn ? (
            <div className="mt-3 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-(--text-muted)">
                    ARN
                  </span>
                  <p className="mt-1 break-all font-(family-name:--font-mono) text-[11px] leading-relaxed text-(--text-secondary)">
                    {secretArn}
                  </p>
                </div>
                <div className="relative shrink-0 sm:pt-5">
                  <button
                    type="button"
                    onClick={copyArn}
                    className="rounded-md border border-(--border) bg-(--bg-field) px-3 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:bg-(--bg-hover)"
                    title="Copy ARN"
                  >
                    {arnCopied ? "Copied!" : "Copy ARN"}
                  </button>
                </div>
              </div>
              {parsedJson && (
                <div>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-(--text-muted)">
                    Keys
                  </span>
                  <p className="mt-1 text-sm font-medium text-(--text-primary)">
                    {Object.keys(parsedJson).length}
                  </p>
                </div>
              )}
            </div>
          ) : secretsLoading ? (
            <p className="mt-3 animate-pulse text-sm text-(--text-muted)">
              Loading ARN…
            </p>
          ) : (
            <p className="mt-3 text-sm text-(--text-muted)">
              ARN not available. Try refreshing the secrets list.
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-0.5 border-b border-(--border)">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-(--accent) text-(--accent)"
                : "text-(--text-secondary) hover:text-(--text-primary)"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "value" && (
        <div>
          {valueLoading && (
            <p className="animate-pulse py-8 text-center text-sm text-(--text-muted)">
              Loading value...
            </p>
          )}
          {valueError && (
            <div className="rounded-lg border border-(--danger)/20 bg-(--danger-dim) px-4 py-3">
              <p className="text-sm text-(--danger)">{valueError}</p>
            </div>
          )}
          {value && !valueLoading && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {value.versionId && (
                  <span className="font-(family-name:--font-mono) text-[11px] text-(--text-muted)">
                    v:{value.versionId.slice(0, 12)}...
                  </span>
                )}
                {value.versionStages?.map((s) => (
                  <span
                    key={s}
                    className="rounded bg-(--accent-dim) px-1.5 py-0.5 text-[10px] font-medium text-(--accent)"
                  >
                    {s}
                  </span>
                ))}
                <div className="ml-auto flex items-center gap-2">
                  {!value.secretBinary && (
                    <button
                      type="button"
                      onClick={() => setEditingValue((e) => !e)}
                      className="rounded-md border border-(--border) px-3 py-1 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-hover)"
                    >
                      {editingValue ? "View" : "Edit"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={copyValue}
                    disabled={!value.secretString || editingValue}
                    className="rounded-md border border-(--border) px-3 py-1 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-hover) disabled:opacity-50"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              {value.secretBinary ? (
                <div className="overflow-x-auto rounded-lg border border-(--border) bg-(--bg-field) p-4 font-(family-name:--font-mono) text-xs">
                  <p className="text-(--text-muted)">[Binary content — editing not supported]</p>
                </div>
              ) : editingValue ? (
                <div className="rounded-lg border border-(--border) bg-(--bg-field) p-4">
                  <SecretValueEditor
                    secretString={value.secretString ?? ""}
                    onSave={saveSecretValue}
                    onCancel={() => setEditingValue(false)}
                  />
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-(--border) bg-(--bg-field) p-4 font-(family-name:--font-mono) text-xs">
                  {parsedJson ? (
                    <JsonViewer
                      data={parsedJson}
                      revealedKeys={revealedKeys}
                      onToggleReveal={toggleReveal}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap text-(--text-secondary)">
                      {value.secretString}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "versions" && (
        <div>
          {versionsLoading && (
            <p className="animate-pulse py-8 text-center text-sm text-(--text-muted)">
              Loading versions...
            </p>
          )}
          {!versionsLoading && versions.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-(--border)">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-(--border) bg-(--bg-surface)">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
                      Version ID
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
                      Stages
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr
                      key={v.versionId}
                      className="border-b border-(--border) transition-colors hover:bg-(--bg-hover)"
                    >
                      <td className="px-3 py-2 font-(family-name:--font-mono) text-xs text-(--text-primary)">
                        {v.versionId}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {v.versionStages.map((s) => (
                            <span
                              key={s}
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                s === "AWSCURRENT"
                                  ? "bg-(--success-dim) text-(--success)"
                                  : s === "AWSPENDING"
                                    ? "bg-(--warn-dim) text-(--warn)"
                                    : "bg-(--bg-surface) text-(--text-muted)"
                              }`}
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-(--text-secondary)">
                        {v.createdDate ? relativeTime(v.createdDate) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!versionsLoading && versions.length === 0 && (
            <p className="py-8 text-center text-sm text-(--text-muted)">
              No versions found.
            </p>
          )}
        </div>
      )}

      {tab === "history" && (
        <div>
          {historyLoading && historyEvents.length === 0 && (
            <p className="animate-pulse py-8 text-center text-sm text-(--text-muted)">
              Loading access history...
            </p>
          )}
          {historyError && (
            <div className="rounded-lg border border-(--danger)/20 bg-(--danger-dim) px-4 py-3">
              <p className="text-sm text-(--danger)">{historyError}</p>
            </div>
          )}
          {!historyLoading && !historyError && historyEvents.length === 0 && (
            <div className="rounded-lg border border-(--border) bg-(--bg-surface) px-6 py-8 text-center">
              <p className="text-sm text-(--text-muted)">
                No access events found in the last 90 days
              </p>
            </div>
          )}
          {historyEvents.length > 0 && (
            <div className="space-y-0">
              {historyEvents.map((ev, i) => (
                <div
                  key={`${ev.eventTime}-${i}`}
                  className="flex items-start gap-3 border-l-2 border-(--border) py-3 pl-4"
                >
                  <div className="-ml-[21px] mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-(--accent)" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-xs font-medium text-(--text-primary)">
                        {ev.eventTime ? relativeTime(ev.eventTime) : "—"}
                      </span>
                      <span className="truncate font-(family-name:--font-mono) text-[11px] text-(--text-secondary)">
                        {ev.userArn
                          ? ev.userArn.replace(
                              /^arn:aws:(?:iam|sts)::\d+:/,
                              "",
                            )
                          : ev.userName || "unknown"}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-(--text-muted)">
                      {ev.sourceIp && <span>IP: {ev.sourceIp}</span>}
                      {ev.userType && <span>{ev.userType}</span>}
                    </div>
                  </div>
                </div>
              ))}
              {historyNextToken && (
                <div className="pt-3 text-center">
                  <button
                    onClick={() => fetchHistory(historyNextToken)}
                    disabled={historyLoading}
                    className="rounded-md border border-(--border) px-4 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:bg-(--bg-hover) disabled:opacity-50"
                  >
                    {historyLoading ? "Loading..." : "Load more"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "rotation" && (
        <div className="space-y-3">
          {meta ? (
            <div className="rounded-lg border border-(--border) bg-(--bg-card) p-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs uppercase tracking-wider text-(--text-muted)">
                    Status
                  </span>
                  <p className="mt-1 flex items-center gap-1.5 text-(--text-primary)">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${meta.rotationEnabled ? "bg-(--success)" : "bg-(--warn)"}`}
                    />
                    {meta.rotationEnabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
                {meta.rotationLambdaArn && (
                  <div>
                    <span className="text-xs uppercase tracking-wider text-(--text-muted)">
                      Lambda
                    </span>
                    <p className="mt-1 truncate font-(family-name:--font-mono) text-xs text-(--text-secondary)">
                      {meta.rotationLambdaArn}
                    </p>
                  </div>
                )}
                {meta.rotationRules?.automaticallyAfterDays && (
                  <div>
                    <span className="text-xs uppercase tracking-wider text-(--text-muted)">
                      Interval
                    </span>
                    <p className="mt-1 text-(--text-primary)">
                      Every {meta.rotationRules.automaticallyAfterDays} days
                    </p>
                  </div>
                )}
                {meta.rotationRules?.scheduleExpression && (
                  <div>
                    <span className="text-xs uppercase tracking-wider text-(--text-muted)">
                      Schedule
                    </span>
                    <p className="mt-1 font-(family-name:--font-mono) text-xs text-(--text-secondary)">
                      {meta.rotationRules.scheduleExpression}
                    </p>
                  </div>
                )}
                {meta.lastRotatedDate && (
                  <div>
                    <span className="text-xs uppercase tracking-wider text-(--text-muted)">
                      Last Rotated
                    </span>
                    <p className="mt-1 text-(--text-primary)">
                      {relativeTime(meta.lastRotatedDate)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="animate-pulse py-8 text-center text-sm text-(--text-muted)">
              Loading rotation info...
            </p>
          )}
        </div>
      )}

      {tab === "policy" && (
        <div className="rounded-lg border border-(--border) bg-(--bg-surface) px-6 py-8 text-center">
          <p className="text-sm text-(--text-muted)">
            Available in Phase 5
          </p>
        </div>
      )}
    </div>
  );
}
