"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo, startTransition } from "react";
import {
  useAwsWorkspace,
  AWS_SAVED_PROFILES_KEY,
  notifyAwsProfileListChanged,
} from "@/lib/context/aws-workspace-provider";
import {
  AWS_REGIONS as REGION_IDS,
  formatRegionMenuLabel,
} from "@/lib/aws/regions";
import { SearchableSelect } from "@/components/searchable-select";

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

  const [savedProfilesRaw, setSavedProfilesRaw] = useState("");

  // Hydration-safe: apply localStorage value only after mount so the SSR
  // render matches the first client render.
  useEffect(() => {
    startTransition(() => {
      setSavedProfilesRaw(localStorage.getItem(AWS_SAVED_PROFILES_KEY) ?? "");
    });
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

  const selectClass =
    "w-full rounded-md border border-(--border) bg-(--bg-field) px-3 py-2 text-sm text-(--text-primary) outline-none transition-colors focus:border-(--accent) focus-visible:ring-2 focus-visible:ring-(--accent)/20";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="font-(family-name:--font-display) text-2xl font-medium text-(--text-primary)">
        Settings
      </h1>

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
            <PrivacyItem variant="success">
              All data stays local — requests go only to AWS, GitHub, and Fly
              APIs using your own credentials
            </PrivacyItem>
            <PrivacyItem variant="success">
              Secret values are held in server memory only and never written to
              disk
            </PrivacyItem>
            <PrivacyItem variant="success">
              No data is sent to any third-party LLM or analytics service
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
