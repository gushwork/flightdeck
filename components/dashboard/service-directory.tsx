"use client";

import Link from "next/link";
import { useState } from "react";
import {
  DIRECTORY_GROUPS,
  type DirectoryGroup,
  type DirectorySubsection,
  type OverviewAccent,
} from "@/lib/modules/overview-directory";

function stripeAccentClass(accent: OverviewAccent): string {
  switch (accent) {
    case "success":
      return "border-l-[3px] border-(--success) bg-(--success-muted)/80";
    case "warn":
      return "border-l-[3px] border-(--warn) bg-(--warn-muted)/80";
    default:
      return "border-l-[3px] border-(--accent) bg-(--accent-muted)/90";
  }
}

function GroupChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-(--text-muted) transition-transform ${open ? "" : "-rotate-90"}`}
      aria-hidden
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

const groupHeaderBar =
  "border-b border-(--border-hairline)/80 px-5 py-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)";

function DirectoryGroupSection({ group }: { group: DirectoryGroup }) {
  const [open, setOpen] = useState(true);
  const headingId = `dir-group-${group.id}`;
  const panelId = `${headingId}-panel`;
  const headerTone =
    group.id === "aws"
      ? "bg-[linear-gradient(115deg,var(--accent-muted),transparent_52%)] hover:bg-[linear-gradient(115deg,var(--accent-muted),var(--bg-elevated)_58%)]"
      : "bg-[linear-gradient(115deg,rgba(87,83,78,0.09),transparent_52%)] hover:bg-[linear-gradient(115deg,rgba(87,83,78,0.12),var(--bg-elevated)_58%)]";
  const iconWrap =
    group.id === "aws"
      ? "bg-(--accent)/12 text-(--accent)"
      : "bg-(--text-secondary)/10 text-(--text-secondary)";

  return (
    <section
      className="overflow-hidden rounded-2xl border border-(--border-hairline) bg-(--bg-elevated) shadow-sm"
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="sr-only">
        {group.title}
      </h2>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-start gap-3 ${groupHeaderBar} ${headerTone}`}
      >
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconWrap}`}
        >
          {group.id === "aws" ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-(family-name:--font-display) text-xl text-(--text-primary)">
            {group.title}
          </span>
          <span className="mt-1 block text-sm leading-relaxed text-(--text-secondary)">
            {group.lead}
          </span>
        </span>
        <GroupChevron open={open} />
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={headingId}
        hidden={!open}
        className={open ? "px-5 pb-5 pt-2" : "hidden"}
      >
        <div className="space-y-5">
          {group.subsections.map((sub) => (
            <Subsection key={sub.id} subsection={sub} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Subsection({ subsection }: { subsection: DirectorySubsection }) {
  return (
    <div>
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--text-muted)">
        {subsection.title}
      </h3>
      <ul className="space-y-2">
        {subsection.links.map((link) => (
          <li key={`${subsection.id}-${link.href}`}>
            <Link
              href={link.href}
              className={`group flex flex-col gap-0.5 rounded-xl px-4 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) ${stripeAccentClass(subsection.accent)}`}
            >
              <span className="text-sm font-semibold text-(--text-primary) group-hover:text-(--accent)">
                {link.label}
                <span className="ml-1 text-(--accent) opacity-0 transition-opacity group-hover:opacity-100">
                  →
                </span>
              </span>
              <span className="text-[13px] leading-snug text-(--text-secondary)">
                {link.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ServiceDirectory() {
  return (
    <div className="grid gap-5 md:grid-cols-2 md:items-start md:gap-6">
      {DIRECTORY_GROUPS.map((group) => (
        <DirectoryGroupSection key={group.id} group={group} />
      ))}
    </div>
  );
}
