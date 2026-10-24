"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { RunnerConfigView, RunnerSnapshot } from "@/lib/runner/types";

const inputClass =
  "w-full rounded-md border border-(--border) bg-(--bg-field) px-3 py-2 text-sm text-(--text-primary) outline-none transition-colors focus:border-(--accent) focus-visible:ring-2 focus-visible:ring-(--accent)/20";

type Notice = { tone: "success" | "danger" | "muted"; text: string };

function Code({ children }: { children: React.ReactNode }) {
  return <code className="font-(family-name:--font-mono) text-[11px]">{children}</code>;
}

function sourceHint(view: RunnerConfigView): string {
  const { host, hostSource } = view.effective;
  if (hostSource === "settings") return "Using the host saved here.";
  if (hostSource === "env") return `Using ${host} from RUNNER_VM_HOST. A host saved here overrides it.`;
  return "No host configured yet.";
}

export function RunnerVmSettings() {
  const [view, setView] = useState<RunnerConfigView | null>(null);
  const [host, setHost] = useState("");
  const [user, setUser] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const apply = useCallback((next: RunnerConfigView) => {
    setView(next);
    setHost(next.saved.host);
    setUser(next.saved.user);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/github/runner/config", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { config?: RunnerConfigView }) => {
        if (!cancelled && data.config) apply(data.config);
      })
      .catch(() => {
        if (!cancelled) setNotice({ tone: "danger", text: "Could not load runner VM settings." });
      });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const saveAndTest = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const saveRes = await fetch("/api/github/runner/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, user }),
      });
      const saved = (await saveRes.json().catch(() => ({}))) as { config?: RunnerConfigView; error?: string };
      if (!saveRes.ok || !saved.config) {
        setNotice({ tone: "danger", text: saved.error ?? `Save failed (HTTP ${saveRes.status})` });
        return;
      }
      apply(saved.config);

      setNotice({ tone: "muted", text: "Saved. Testing SSH connection…" });
      const testRes = await fetch("/api/github/runner", { cache: "no-store" });
      const test = (await testRes.json().catch(() => ({}))) as { snapshot?: RunnerSnapshot; error?: string };
      if (testRes.ok && test.snapshot) {
        const s = test.snapshot;
        setNotice({ tone: "success", text: `Connected to ${s.hostname ?? "VM"} — runner ${s.runnerName ?? ""} is ${s.state}.` });
      } else {
        setNotice({ tone: "danger", text: `Saved, but the connection test failed: ${test.error ?? `HTTP ${testRes.status}`}` });
      }
    } catch (err) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }, [host, user, apply]);

  const noticeColor =
    notice?.tone === "success" ? "text-(--success)" : notice?.tone === "danger" ? "text-(--danger)" : "text-(--text-muted)";

  return (
    <div className="rounded-xl border border-(--border) bg-(--bg-field) p-5 space-y-4">
      <p className="text-xs text-(--text-secondary)">
        The Azure VM that hosts the self-hosted GitHub Actions runner. Flightdeck reads its status over SSH for the{" "}
        <Link href="/github/runner" className="font-medium text-(--accent) hover:underline">
          Runner page
        </Link>
        .
      </p>

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1.5">
          <label htmlFor="runner-vm-host" className="block text-xs font-medium text-(--text-secondary)">
            IP address or hostname
          </label>
          <input
            id="runner-vm-host"
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder={view?.effective.hostSource === "env" ? (view.effective.host ?? "") : "e.g. 20.1.2.3"}
            spellCheck={false}
            autoComplete="off"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="runner-vm-user" className="block text-xs font-medium text-(--text-secondary)">
            SSH user
          </label>
          <input
            id="runner-vm-user"
            type="text"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder={view?.effective.user ?? "azureuser"}
            spellCheck={false}
            autoComplete="off"
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-1 text-[11px] text-(--text-muted)">
        {view && <p>{sourceHint(view)} Leave a field empty to fall back to the environment.</p>}
        <p>
          {view?.hasPassword ? (
            <>SSH password found in the environment.</>
          ) : (
            <>
              No SSH password found — add <Code>VM_PASSWORD</Code> to <Code>.env.azure</Code>. It is never saved from this page.
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void saveAndTest()}
          disabled={busy || !view}
          className="rounded-lg bg-(--accent) px-3.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Working…" : "Save & test connection"}
        </button>
        {notice && (
          <span role="status" className={`text-xs ${noticeColor}`}>
            {notice.text}
          </span>
        )}
      </div>
    </div>
  );
}
