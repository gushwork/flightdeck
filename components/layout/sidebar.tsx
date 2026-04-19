"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getEnabledNavSections,
  getFooterNav,
  SIDEBAR_SERVICE_GROUPS,
  type ModuleNavSection,
  type NavChildItem,
  type NavIconId,
  type NavItemDef,
} from "@/lib/modules/registry";
import { useGithubData } from "@/lib/context/github-data-provider";

const icons: Record<NavIconId, React.ReactNode> = {
  aws: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
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
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
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
      <span className="text-current opacity-90">{icon}</span>
      <span className="flex-1">{label}</span>
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

/** Top-level service tier (AWS, GitHub) — sits above module utilities. */
function ServiceGroupLabel({
  children,
  first,
}: {
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <span
      className={`mb-2 block px-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-(--text-secondary) ${
        first ? "mt-4" : "mt-6"
      }`}
    >
      {children}
    </span>
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

function CollapsibleNavGroup({
  item,
  pathname,
  secretsCount,
  hasGithubRunActivity,
}: {
  item: NavItemDef & { children: NavChildItem[] };
  pathname: string;
  secretsCount: number;
  hasGithubRunActivity: boolean;
}) {
  const [expanded, setExpanded] = useState(() =>
    routeInNavGroup(pathname, item),
  );

  useEffect(() => {
    if (routeInNavGroup(pathname, item)) {
      setExpanded(true);
    }
  }, [pathname, item]);

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
          <span className="text-current opacity-90">{icons[item.icon]}</span>
          <span className="flex-1">{item.label}</span>
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
          onClick={() => setExpanded((e) => !e)}
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
        <div className="ml-2.5 space-y-0.5 border-l border-(--border-hairline) pl-2.5">
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
) {
  return section.items.map((item) =>
    item.children?.length ? (
      <CollapsibleNavGroup
        key={`${section.id}-${item.href}`}
        item={item as NavItemDef & { children: NavChildItem[] }}
        pathname={pathname}
        secretsCount={secretsCount}
        hasGithubRunActivity={hasActiveRuns}
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

export function Sidebar({ secretsCount }: { secretsCount: number }) {
  const pathname = usePathname();
  const sections = getEnabledNavSections();
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const footer = getFooterNav();
  const { summary } = useGithubData();
  const hasActiveRuns = summary.inProgress > 0 || summary.queued > 0;

  return (
    <nav className="flex h-full flex-col px-3 py-4 text-sm">
      <div>
        <NavItem
          href="/"
          icon={icons.dashboard}
          label="Dashboard"
          active={pathname === "/"}
        />

        {SIDEBAR_SERVICE_GROUPS.map((group, groupIndex) => (
          <div key={group.title}>
            <ServiceGroupLabel first={groupIndex === 0}>{group.title}</ServiceGroupLabel>
            <div className="ml-0.5 space-y-1 border-l border-(--border-hairline) pl-2.5">
              {group.moduleIds.map((moduleId) => {
                const section = sectionById.get(moduleId);
                if (!section) return null;
                return (
                  <div key={moduleId} className="space-y-0.5">
                    {renderNavItems(section, pathname, secretsCount, hasActiveRuns)}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
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
