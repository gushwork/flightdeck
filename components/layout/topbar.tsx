"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import { SearchableSelect } from "@/components/searchable-select";
import {
  AWS_REGIONS as REGION_IDS,
  formatRegionMenuLabel,
} from "@/lib/aws/regions";

const selectClass =
  "w-[min(200px,42vw)] max-w-[min(280px,50vw)] rounded-md border border-(--border) bg-(--bg-field) px-2 py-1.5 text-xs text-(--text-primary) outline-none transition-colors focus:border-(--accent) focus:ring-1 focus:ring-(--accent)/30";

export function Topbar({
  items,
  showWorkspaceSelectors = false,
}: {
  items: string[];
  showWorkspaceSelectors?: boolean;
}) {
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

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-(--border-hairline) bg-(--bg-elevated) px-8">
      <Link href="/" className="group flex min-w-0 shrink items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--accent) text-xs font-semibold tracking-tighter text-white shadow-sm">
          FD
        </span>
        <span className="font-(family-name:--font-display) text-base font-medium tracking-tight text-(--text-primary)">
          Flightdeck
        </span>
      </Link>

      <nav
        className="hidden min-w-0 flex-1 items-center justify-center gap-1.5 text-sm sm:flex"
        aria-label="Breadcrumb"
      >
        {items.map((item, i) => (
          <span key={`${item}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="text-(--text-faint)">/</span>
            )}
            <span
              className={
                i === items.length - 1
                  ? "truncate font-medium text-(--text-primary)"
                  : "truncate text-(--text-muted)"
              }
            >
              {item}
            </span>
          </span>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        {showWorkspaceSelectors && (
          <>
            <label className="flex items-center gap-1.5">
              <span className="hidden text-[11px] text-(--text-muted) md:inline">
                Region
              </span>
              <SearchableSelect
                value={region}
                onValueChange={setRegion}
                className={selectClass}
                aria-label="AWS region"
                searchPlaceholder="Search regions…"
                options={regionOptions.map((r) => ({
                  value: r,
                  label: formatRegionMenuLabel(r),
                }))}
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="hidden text-[11px] text-(--text-muted) md:inline">
                Account
              </span>
              <SearchableSelect
                value={profile}
                onValueChange={setProfile}
                className={selectClass}
                aria-label="AWS account profile"
                searchPlaceholder="Search profiles…"
                options={accountSelectOptions.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
              />
            </label>
          </>
        )}
        <Link
          href="/settings"
          className="text-xs font-medium text-(--text-muted) transition-colors hover:text-(--accent)"
        >
          API &amp; privacy
        </Link>
      </div>
    </header>
  );
}
