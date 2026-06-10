"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getEnabledNavSections,
  getFooterNav,
  MODULE_NAV,
  SIDEBAR_SERVICE_GROUPS,
  type ModuleId,
  type ModuleNavSection,
  type NavChildItem,
  type NavIconId,
  type NavItemDef,
} from "@/lib/modules/registry";
import { useGithubNavActivity } from "@/lib/hooks/use-github-nav-activity";

/** AWS collapsible shell key (distinct from `/aws` hub href). */
const AWS_SECTION_EXPAND_KEY = "aws-section";

const icons: Record<NavIconId, React.ReactNode> = {
  aws: (
    <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0" aria-hidden>
      <path
        fill="#232F3E"
        d="M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.375 6.18 6.18 0 0 1-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.862.272a2.287 2.287 0 0 1-.28.104.488.488 0 0 1-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.279-.144.614-.264 1.005-.36a4.84 4.84 0 0 1 1.246-.151c.95 0 1.644.216 2.091.647.439.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 0 0-.735-.136 6.02 6.02 0 0 0-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 0 1 .32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 0 1-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758.777.777 0 0 0-.215-.559c-.144-.151-.416-.287-.807-.415l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.902 1.902 0 0 1-.4-1.158c0-.335.073-.63.216-.886.144-.255.335-.479.575-.654.24-.184.51-.32.83-.415.32-.096.655-.136 1.006-.136.175 0 .359.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 0 1 .24.2.43.43 0 0 1 .071.263v.375c0 .168-.064.256-.184.256a.83.83 0 0 1-.303-.096 3.652 3.652 0 0 0-1.532-.311c-.455 0-.815.071-1.062.223-.248.152-.375.383-.375.71 0 .224.08.416.24.567.159.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767.247.327.367.702.367 1.117 0 .343-.072.655-.207.926-.144.272-.336.511-.583.703-.248.2-.543.343-.886.447-.36.111-.734.167-1.142.167zM21.698 16.207c-2.626 1.94-6.442 2.969-9.722 2.969-4.598 0-8.74-1.7-11.87-4.526-.247-.223-.024-.527.272-.351 3.384 1.963 7.559 3.153 11.877 3.153 2.914 0 6.114-.607 9.06-1.852.439-.2.814.287.383.607zM22.792 14.961c-.336-.43-2.22-.207-3.074-.103-.255.032-.295-.192-.063-.36 1.5-1.053 3.967-.75 4.254-.399.287.36-.08 2.826-1.485 4.007-.215.184-.423.088-.327-.151.32-.79 1.03-2.57.695-2.994z"
      />
    </svg>
  ),
  insights: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 13h12M4.5 10V6M8 13V3M11.5 10V7" />
    </svg>
  ),
  table: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <path d="M2 6h12M6 2v12" />
    </svg>
  ),
  shield: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 1.5L3 3.5v4c0 3.1 2.1 5.9 5 6.5 2.9-.6 5-3.4 5-6.5v-4L8 1.5z" />
    </svg>
  ),
  arrowsExchange: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5.5L2 7.5 4 9.5M12 5.5L14 7.5 12 9.5M6 7.5h4" />
    </svg>
  ),
  userPlus: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="6" cy="5" r="2.5" />
      <path d="M2.5 13.5v-.5a3.5 3.5 0 017 0v.5M11 5v3M12.5 6.5H9.5" />
    </svg>
  ),
  playCircle: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M6.5 6.5L10 8l-3.5 1.5V6.5z" fill="currentColor" stroke="none" />
    </svg>
  ),
  listRuns: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 4h12M2 8h12M2 12h8" />
      <circle cx="13" cy="12" r="1.5" fill="currentColor" />
    </svg>
  ),
  gitBranch: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="5" cy="4" r="2" />
      <circle cx="5" cy="12" r="2" />
      <circle cx="11" cy="8" r="2" />
      <path d="M5 6v2a2 2 0 002 2h2a2 2 0 002 2" />
    </svg>
  ),
  dashboard: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    </svg>
  ),
  secrets: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5 7V5a3 3 0 016 0v2" />
      <circle cx="8" cy="10.5" r="1" fill="currentColor" />
    </svg>
  ),
  search: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  ),
  amplify: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 2.5l5 3v5l-5 3-5-3v-5l5-3z" />
      <path d="M3 5.5l5 3 5-3M8 8.5v5" />
    </svg>
  ),
  audit: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1.5 8s2.2-3.5 6.5-3.5 6.5 3.5 6.5 3.5-2.2 3.5-6.5 3.5-6.5-3.5-6.5-3.5z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="8" cy="8" r="2" />
      <path d="M13.4 10a1.2 1.2 0 00.24 1.32l.04.04a1.46 1.46 0 11-2.06 2.06l-.04-.04a1.2 1.2 0 00-1.32-.24 1.2 1.2 0 00-.73 1.1v.12a1.46 1.46 0 01-2.92 0v-.06a1.2 1.2 0 00-.79-1.1 1.2 1.2 0 00-1.32.24l-.04.04a1.46 1.46 0 11-2.06-2.06l.04-.04a1.2 1.2 0 00.24-1.32 1.2 1.2 0 00-1.1-.73H1.46a1.46 1.46 0 010-2.92h.06a1.2 1.2 0 001.1-.79 1.2 1.2 0 00-.24-1.32l-.04-.04a1.46 1.46 0 112.06-2.06l.04.04a1.2 1.2 0 001.32.24h.06a1.2 1.2 0 00.73-1.1V1.46a1.46 1.46 0 012.92 0v.06a1.2 1.2 0 00.73 1.1 1.2 1.2 0 001.32-.24l.04-.04a1.46 1.46 0 112.06 2.06l-.04.04a1.2 1.2 0 00-.24 1.32v.06a1.2 1.2 0 001.1.73h.12a1.46 1.46 0 010 2.92h-.06a1.2 1.2 0 00-1.1.73z" />
    </svg>
  ),
  github: (
    <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0" aria-hidden>
      <path
        fill="currentColor"
        d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
      />
    </svg>
  ),
  fly: (
    <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0" aria-hidden>
      <path
        fill="#7B36F6"
        d="M11.987 0c-2.45-.01-5.002.925-6.541 2.897-1.17 1.502-1.664 3.474-1.49 5.356.29 2.112 1.476 3.96 2.676 5.672a41.5 41.5 0 0 0 4.216 4.831c-1.063.832-1.943 2.286-1.357 3.644.821 2.32 4.665 2.05 5.122-.372.39-1.288-.694-2.533-1.428-3.309 2.388-2.431 4.706-5.036 6.17-8.145.595-1.32.902-2.802.614-4.24-.28-2.341-1.823-4.473-3.967-5.46C14.76.266 13.364.016 11.987 0m-.236 1.577v15.534C9.881 13.483 7.724 9.266 8.73 5.069c.35-1.539 1.253-3.309 3.02-3.492m1.996.04c1.534.357 3.031 1.096 3.906 2.48 1.3 1.93 1.318 4.55.1 6.521-1.268 2.395-3.06 4.463-4.916 6.415 1.472-2.974 3.074-6.106 3.182-9.5-.043-2.08-.438-4.612-2.272-5.916M11.97 20.103c.848.342 1.597 1.983.153 2.173-.664.15-1.367-.599-.995-1.222.213-.355.488-.73.842-.95"
      />
    </svg>
  ),
  flySecrets: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5 7V5a3 3 0 016 0v2" />
      <circle cx="8" cy="10.5" r="1" fill="currentColor" />
    </svg>
  ),
};

function NavItem({
  href,
  icon,
  label,
  badge,
  active,
  activityDot,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: string | number;
  active: boolean;
  /** Shows a pulsing dot beside the label (e.g. for active GitHub runs) */
  activityDot?: boolean;
}) {
  const base =
    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors";
  const activeClass =
    "bg-(--accent-muted) text-(--accent) font-medium";
  const inactiveClass =
    "text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)";

  return (
    <Link href={href} className={`${base} ${active ? activeClass : inactiveClass}`}>
      <span className="text-current">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {activityDot && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--accent) opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-(--accent)" />
        </span>
      )}
      {badge !== undefined && (
        <span className="rounded bg-(--bg-muted) px-1.5 py-0.5 font-(family-name:--font-mono) text-[10px] text-(--text-muted)">
          {badge}
        </span>
      )}
    </Link>
  );
}

function resolveBadge(
  item: NavItemDef,
  secretsCount: number,
): string | number | undefined {
  if (item.badge === "secretsCount") return secretsCount;
  return undefined;
}

function isNavActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/aws") return pathname === "/aws";
  if (href === "/secrets/search") return pathname.startsWith("/secrets/search");
  if (href === "/secrets/overview")
    return pathname.startsWith("/secrets/overview");
  if (href === "/secrets") {
    return (
      pathname === "/secrets" ||
      (pathname.startsWith("/secrets/") &&
        !pathname.startsWith("/secrets/search") &&
        !pathname.startsWith("/secrets/overview"))
    );
  }
  if (href === "/amplify") {
    return (
      pathname === "/amplify" ||
      (pathname.startsWith("/amplify/") && !pathname.startsWith("/amplify/search"))
    );
  }
  if (href === "/amplify/search") return pathname.startsWith("/amplify/search");
  if (href === "/iam") return pathname === "/iam";
  if (href === "/iam/cross-account-copy")
    return pathname.startsWith("/iam/cross-account-copy");
  if (href === "/iam/create-user")
    return pathname.startsWith("/iam/create-user");
  if (href === "/github/overview")
    return pathname.startsWith("/github/overview");
  if (href === "/github") return pathname === "/github";
  if (href === "/github/runs") return pathname.startsWith("/github/runs");
  if (href === "/github/workflows") return pathname.startsWith("/github/workflows");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function routeInNavGroup(
  pathname: string,
  item: NavItemDef & { children: NavChildItem[] },
): boolean {
  if (isNavActive(item.href, pathname)) return true;
  return item.children.some((c) => isNavActive(c.href, pathname));
}

/** True when any AWS-sidebar route is active (hub + nested tools). */
function routeInAwsSection(pathname: string): boolean {
  if (pathname === "/aws") return true;
  if (pathname.startsWith("/secrets")) return true;
  if (pathname.startsWith("/amplify")) return true;
  if (pathname === "/analyzer" || pathname.startsWith("/analyzer/")) return true;
  if (pathname === "/iam" || pathname.startsWith("/iam/")) return true;
  return false;
}

function listCollapsibleNavParents(): (NavItemDef & {
  children: NavChildItem[];
})[] {
  const out: (NavItemDef & { children: NavChildItem[] })[] = [];
  for (const mod of MODULE_NAV) {
    if (!mod.enabled || mod.footer) continue;
    for (const item of mod.items) {
      if (item.children?.length) {
        out.push(item as NavItemDef & { children: NavChildItem[] });
      }
    }
  }
  return out;
}

function allSidebarExpandKeys(): string[] {
  return [AWS_SECTION_EXPAND_KEY, ...listCollapsibleNavParents().map((i) => i.href)];
}

function expandedFromPathname(pathname: string): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const k of allSidebarExpandKeys()) {
    next[k] = false;
  }
  next[AWS_SECTION_EXPAND_KEY] = routeInAwsSection(pathname);
  for (const item of listCollapsibleNavParents()) {
    next[item.href] = routeInNavGroup(pathname, item);
  }
  return next;
}

function CollapsibleNavGroup({
  item,
  pathname,
  secretsCount,
  hasGithubRunActivity,
  expanded,
  onToggleExpanded,
}: {
  item: NavItemDef & { children: NavChildItem[] };
  pathname: string;
  secretsCount: number;
  hasGithubRunActivity: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const base =
    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors";
  const activeClass =
    "bg-(--accent-muted) text-(--accent) font-medium";
  const inactiveClass =
    "text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)";
  const parentActive = routeInNavGroup(pathname, item);

  return (
    <div className="space-y-0.5">
      <div className="flex items-stretch gap-0.5 rounded-lg">
        <Link
          href={item.href}
          className={`${base} min-w-0 flex-1 items-center ${
            parentActive ? activeClass : inactiveClass
          }`}
        >
          <span className="text-current">{icons[item.icon]}</span>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.badge !== undefined && (
            <span className="rounded bg-(--bg-muted) px-1.5 py-0.5 font-(family-name:--font-mono) text-[10px] text-(--text-muted)">
              {resolveBadge(item, secretsCount)}
            </span>
          )}
        </Link>
        <button
          type="button"
          className={`flex w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
            expanded
              ? "text-(--text-secondary) hover:bg-(--bg-hover)"
              : "text-(--text-faint) hover:bg-(--bg-hover) hover:text-(--text-secondary)"
          }`}
          aria-expanded={expanded}
          aria-label={
            expanded ? `Collapse ${item.label} submenu` : `Expand ${item.label} submenu`
          }
          onClick={onToggleExpanded}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${expanded ? "" : "-rotate-90"}`}
            aria-hidden
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      </div>
      {expanded && (
        <div className="ml-2.5 space-y-0.5 pl-2.5">
          {item.children.map((child) => (
            <NavItem
              key={child.href}
              href={child.href}
              icon={icons[child.icon]}
              label={child.label}
              active={isNavActive(child.href, pathname)}
              activityDot={child.href === "/github" && hasGithubRunActivity}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function renderNavItems(
  section: ModuleNavSection,
  pathname: string,
  secretsCount: number,
  hasActiveRuns: boolean,
  expandedByKey: Record<string, boolean>,
  toggleExpandedKey: (key: string) => void,
) {
  return section.items.map((item) =>
    item.children?.length ? (
      <CollapsibleNavGroup
        key={`${section.id}-${item.href}`}
        item={item as NavItemDef & { children: NavChildItem[] }}
        pathname={pathname}
        secretsCount={secretsCount}
        hasGithubRunActivity={hasActiveRuns}
        expanded={expandedByKey[item.href] ?? false}
        onToggleExpanded={() => toggleExpandedKey(item.href)}
      />
    ) : (
      <NavItem
        key={`${section.id}-${item.href}`}
        href={item.href}
        icon={icons[item.icon]}
        label={item.label}
        badge={resolveBadge(item, secretsCount)}
        active={isNavActive(item.href, pathname)}
      />
    ),
  );
}

function CollapsibleAwsSection({
  headerItem,
  moduleIds,
  sectionById,
  pathname,
  secretsCount,
  hasActiveRuns,
  expanded,
  onToggleExpanded,
  expandedByKey,
  toggleExpandedKey,
}: {
  headerItem: NavItemDef;
  moduleIds: ModuleId[];
  sectionById: Map<ModuleId, ModuleNavSection>;
  pathname: string;
  secretsCount: number;
  hasActiveRuns: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  expandedByKey: Record<string, boolean>;
  toggleExpandedKey: (key: string) => void;
}) {
  const base =
    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors";
  const activeClass =
    "bg-(--accent-muted) text-(--accent) font-medium";
  const inactiveClass =
    "text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)";
  const sectionActive = routeInAwsSection(pathname);

  return (
    <div className="space-y-0.5">
      <div className="flex items-stretch gap-0.5 rounded-lg">
        <Link
          href={headerItem.href}
          className={`${base} min-w-0 flex-1 items-center ${
            sectionActive ? activeClass : inactiveClass
          }`}
        >
          <span className="text-current">{icons[headerItem.icon]}</span>
          <span className="min-w-0 flex-1 truncate">{headerItem.label}</span>
          {headerItem.badge !== undefined && (
            <span className="rounded bg-(--bg-muted) px-1.5 py-0.5 font-(family-name:--font-mono) text-[10px] text-(--text-muted)">
              {resolveBadge(headerItem, secretsCount)}
            </span>
          )}
        </Link>
        <button
          type="button"
          className={`flex w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
            expanded
              ? "text-(--text-secondary) hover:bg-(--bg-hover)"
              : "text-(--text-faint) hover:bg-(--bg-hover) hover:text-(--text-secondary)"
          }`}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? "Collapse AWS tools section"
              : "Expand AWS tools section"
          }
          onClick={onToggleExpanded}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${expanded ? "" : "-rotate-90"}`}
            aria-hidden
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      </div>
      {expanded && (
        <div className="ml-2.5 space-y-0.5 pl-2.5">
          {moduleIds.map((moduleId) => {
            const section = sectionById.get(moduleId);
            if (!section) return null;
            return (
              <div key={moduleId} className="space-y-0.5">
                {renderNavItems(
                  section,
                  pathname,
                  secretsCount,
                  hasActiveRuns,
                  expandedByKey,
                  toggleExpandedKey,
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ secretsCount }: { secretsCount: number }) {
  const pathname = usePathname();
  const sections = getEnabledNavSections();
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const footer = getFooterNav();
  const { hasActiveRuns } = useGithubNavActivity();

  const [expandedByKey, setExpandedByKey] = useState<Record<string, boolean>>(
    () => expandedFromPathname(pathname),
  );

  useEffect(() => {
    const sync = expandedFromPathname(pathname);
    const id = requestAnimationFrame(() => {
      setExpandedByKey((prev) => {
        const keys = allSidebarExpandKeys();
        const next = { ...prev };
        for (const k of keys) {
          if (!(k in next)) next[k] = false;
        }
        let changed = false;
        for (const k of keys) {
          if (sync[k] && next[k] !== true) {
            next[k] = true;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  const toggleExpandedKey = useCallback((key: string) => {
    setExpandedByKey((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? false),
    }));
  }, []);

  const allExpanded = useMemo(() => {
    const keys = allSidebarExpandKeys();
    return keys.length > 0 && keys.every((k) => expandedByKey[k] ?? false);
  }, [expandedByKey]);

  const toggleAllSidebarSections = useCallback(() => {
    setExpandedByKey((prev) => {
      const keys = allSidebarExpandKeys();
      const nextAllExpanded =
        keys.length > 0 && keys.every((k) => prev[k] ?? false);
      const next: Record<string, boolean> = {};
      for (const k of keys) {
        next[k] = !nextAllExpanded;
      }
      return next;
    });
  }, []);

  return (
    <nav className="flex h-full flex-col px-3 py-4 text-sm">
      <div>
        <div className="flex justify-end">
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-(--border-hairline) bg-(--bg-elevated) text-(--text-secondary) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
            onClick={toggleAllSidebarSections}
            aria-label={
              allExpanded
                ? "Collapse all sidebar sections"
                : "Expand all sidebar sections"
            }
            title={allExpanded ? "Collapse all" : "Expand all"}
          >
            {allExpanded ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M4 10.5l4-3.5 4 3.5" />
                <path d="M4 6l4-3.5 4 3.5" />
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
                aria-hidden
              >
                <path d="M4 3l4 3.5 4-3.5" />
                <path d="M4 7.5l4 3.5 4-3.5" />
              </svg>
            )}
          </button>
        </div>

        <div className="mt-3">
          <NavItem
            href="/"
            icon={icons.dashboard}
            label="Dashboard"
            active={pathname === "/"}
          />
        </div>

        {SIDEBAR_SERVICE_GROUPS.map((group, groupIndex) => {
          const marginClass = groupIndex === 0 ? "mt-4" : "mt-6";

          if ("collapsible" in group && group.collapsible) {
            const headerSection = sectionById.get(group.headerModuleId);
            const headerItem = headerSection?.items[0];
            const groupKey = `${group.headerModuleId}-${group.moduleIds.join("-")}`;
            return (
              <div key={groupKey} className={marginClass}>
                {headerItem ? (
                  <CollapsibleAwsSection
                    headerItem={headerItem}
                    moduleIds={group.moduleIds}
                    sectionById={sectionById}
                    pathname={pathname}
                    secretsCount={secretsCount}
                    hasActiveRuns={hasActiveRuns}
                    expanded={
                      expandedByKey[AWS_SECTION_EXPAND_KEY] ?? false
                    }
                    onToggleExpanded={() =>
                      toggleExpandedKey(AWS_SECTION_EXPAND_KEY)
                    }
                    expandedByKey={expandedByKey}
                    toggleExpandedKey={toggleExpandedKey}
                  />
                ) : null}
              </div>
            );
          }

          return (
            <div
              key={group.moduleIds.join("-")}
              className={marginClass}
            >
              <div className="space-y-1">
                {group.moduleIds.map((moduleId) => {
                  const section = sectionById.get(moduleId);
                  if (!section) return null;
                  return (
                    <div key={moduleId} className="space-y-0.5">
                      {renderNavItems(
                        section,
                        pathname,
                        secretsCount,
                        hasActiveRuns,
                        expandedByKey,
                        toggleExpandedKey,
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-auto border-t border-(--border-hairline) pt-4">
        {footer.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={icons[item.icon]}
            label={item.label}
            active={pathname.startsWith(item.href)}
          />
        ))}
      </div>
    </nav>
  );
}
