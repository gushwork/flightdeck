"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  useAwsWorkspace,
  AWS_SAVED_PROFILES_KEY,
  notifyAwsProfileListChanged,
} from "@/lib/context/aws-workspace-provider";
import {
  AWS_REGIONS as REGION_IDS,
  formatRegionMenuLabel,
} from "@/lib/aws/regions";
import {
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_MODEL_STORAGE_KEY,
} from "@/lib/agent/openrouter-model";
import { SearchableSelect } from "@/components/searchable-select";

const MODELS = [
  "anthropic/claude-sonnet-4-6",
  "openai/gpt-4o",
  "google/gemini-2.5-pro",
] as const;

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-(--text-primary)">
      {children}
    </h2>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-(--text-secondary)">
      {children}
    </label>
  );
}

export default function SettingsPage() {
  const { region, setRegion, profile, setProfile, profileOptions } =
    useAwsWorkspace();

  const regionOptions = useMemo(() => {
    if (REGION_IDS.includes(region as (typeof REGION_IDS)[number])) {
      return [...REGION_IDS];
    }
    return [region, ...REGION_IDS];
  }, [region]);

  const accountSelectOptions = useMemo(() => {
    if (!profile.trim()) return profileOptions;
    if (profileOptions.some((o) => o.value === profile)) return profileOptions;
    return [
      ...profileOptions,
      { label: profile, value: profile },
    ];
  }, [profile, profileOptions]);

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState<string>(DEFAULT_OPENROUTER_MODEL);
  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
  const [testMessage, setTestMessage] = useState("");
  const [savedProfilesRaw, setSavedProfilesRaw] = useState("");

  useEffect(() => {
    setApiKey(localStorage.getItem("openrouter-api-key") ?? "");
    setModel(localStorage.getItem(OPENROUTER_MODEL_STORAGE_KEY) ?? MODELS[0]);
    setSavedProfilesRaw(localStorage.getItem(AWS_SAVED_PROFILES_KEY) ?? "");
  }, []);

  const commitSavedProfiles = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      localStorage.setItem(AWS_SAVED_PROFILES_KEY, trimmed);
    } else {
      localStorage.removeItem(AWS_SAVED_PROFILES_KEY);
    }
    notifyAwsProfileListChanged();
  }, []);

  const handleApiKeyChange = useCallback((value: string) => {
    setApiKey(value);
    localStorage.setItem("openrouter-api-key", value);
  }, []);

  const handleModelChange = useCallback((value: string) => {
    setModel(value);
    localStorage.setItem(OPENROUTER_MODEL_STORAGE_KEY, value);
  }, []);

  const testConnection = useCallback(async () => {
    setTestStatus("testing");
    setTestMessage("");
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Say hello in one word." }],
          page: "settings",
          entityId: null,
          region,
          profile: profile.trim() || undefined,
          model: model.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error ?? `HTTP ${res.status}`,
        );
      }
      setTestStatus("success");
      setTestMessage("Connection successful");
    } catch (e) {
      setTestStatus("error");
      setTestMessage(e instanceof Error ? e.message : "Connection failed");
    }
  }, [region, profile, model]);

  const selectClass =
    "w-full rounded-md border border-(--border) bg-(--bg-field) px-3 py-2 text-sm text-(--text-primary) outline-none transition-colors focus:border-(--accent) focus-visible:ring-2 focus-visible:ring-(--accent)/20";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="font-(family-name:--font-display) text-2xl font-medium text-(--text-primary)">
        Settings
      </h1>

      {/* OpenRouter Configuration */}
      <section className="space-y-4">
        <SectionHeading>OpenRouter Configuration</SectionHeading>
        <div className="rounded-xl border border-(--border) bg-(--bg-field) p-5 space-y-4">
          <div className="space-y-1.5">
            <FieldLabel>API Key</FieldLabel>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder="sk-or-…"
                className={`${selectClass} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs text-(--text-muted) transition-colors hover:text-(--text-secondary)"
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            <p className="text-[11px] text-(--text-muted)">
              Stored in browser localStorage. Set OPENROUTER_API_KEY in
              .env.local for server-side use.
            </p>
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Model</FieldLabel>
            <SearchableSelect
              value={model}
              onValueChange={handleModelChange}
              className={selectClass}
              searchPlaceholder="Search models…"
              options={MODELS.map((m) => ({ value: m, label: m }))}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={testConnection}
              disabled={testStatus === "testing"}
              className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {testStatus === "testing" ? "Testing…" : "Test Connection"}
            </button>
            {testStatus === "success" && (
              <span className="text-xs text-(--success)">{testMessage}</span>
            )}
            {testStatus === "error" && (
              <span className="text-xs text-(--danger)">{testMessage}</span>
            )}
          </div>
        </div>
      </section>

      <hr className="border-(--border)" />

      {/* AWS Configuration */}
      <section className="space-y-4">
        <SectionHeading>AWS Configuration</SectionHeading>
        <div className="rounded-xl border border-(--border) bg-(--bg-field) p-5 space-y-4">
          <p className="text-xs text-(--text-secondary)">
            Region and account profile match the top bar. You can also change
            them here.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel>Region</FieldLabel>
              <SearchableSelect
                value={region}
                onValueChange={setRegion}
                className={selectClass}
                searchPlaceholder="Search regions…"
                options={regionOptions.map((r) => ({
                  value: r,
                  label: formatRegionMenuLabel(r),
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Account (profile)</FieldLabel>
              <SearchableSelect
                value={profile}
                onValueChange={setProfile}
                className={selectClass}
                searchPlaceholder="Search profiles…"
                options={accountSelectOptions.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Named profiles (comma-separated)</FieldLabel>
            <input
              type="text"
              value={savedProfilesRaw}
              onChange={(e) => setSavedProfilesRaw(e.target.value)}
              onBlur={() => commitSavedProfiles(savedProfilesRaw)}
              placeholder="e.g. prod, staging, dev-admin"
              className={selectClass}
            />
            <p className="text-[11px] text-(--text-muted)">
              Adds account options in this browser (saved locally). Combine with{" "}
              <code className="font-(family-name:--font-mono) text-[11px]">
                NEXT_PUBLIC_AWS_PROFILES
              </code>{" "}
              in{" "}
              <code className="font-(family-name:--font-mono) text-[11px]">
                .env.local
              </code>{" "}
              for team-wide defaults. Profiles must exist in{" "}
              <code className="font-(family-name:--font-mono) text-[11px]">
                ~/.aws/credentials
              </code>{" "}
              or SSO cache; the server uses{" "}
              <code className="font-(family-name:--font-mono) text-[11px]">
                fromIni
              </code>{" "}
              for named profiles.
            </p>
          </div>
        </div>
      </section>

      <hr className="border-(--border)" />

      {/* Data Privacy */}
      <section className="space-y-4">
        <SectionHeading>Data Privacy</SectionHeading>
        <div className="rounded-xl border border-(--border) bg-(--bg-field) p-5">
          <ul className="space-y-3">
            <PrivacyItem variant="warn">
              Policy documents, entity names, and tags <strong>are</strong> sent
              to OpenRouter for agent analysis
            </PrivacyItem>
            <PrivacyItem variant="success">
              Secret values are <strong>never</strong> sent to OpenRouter
            </PrivacyItem>
            <PrivacyItem variant="success">
              All secret values are held in server memory only and never written
              to disk
            </PrivacyItem>
            <PrivacyItem variant="success">
              No data is sent to any service other than OpenRouter and AWS
            </PrivacyItem>
          </ul>
        </div>
      </section>

      <section className="border-t border-(--border-hairline) pt-6">
        <p className="text-xs leading-relaxed text-(--text-muted)">
          <Link
            href="/design-system"
            className="font-medium text-(--accent) hover:underline"
          >
            Design system
          </Link>{" "}
          — tokens, sidebar patterns, and UI conventions (detail in{" "}
          <code className="rounded bg-(--bg-muted) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">
            .cursor/rules/design-system.mdc
          </code>
          ).
        </p>
      </section>
    </div>
  );
}

function PrivacyItem({
  variant,
  children,
}: {
  variant: "success" | "warn";
  children: React.ReactNode;
}) {
  const bgColor =
    variant === "success" ? "bg-(--success-dim)" : "bg-(--warn-dim)";

  return (
    <li className={`flex items-start gap-3 rounded-md px-3 py-2.5 ${bgColor}`}>
      {variant === "success" ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 shrink-0 text-(--success)"
        >
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 shrink-0 text-(--warn)"
        >
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 5v3.5M8 10.5v.5" />
        </svg>
      )}
      <span className="text-sm text-(--text-primary)">{children}</span>
    </li>
  );
}
