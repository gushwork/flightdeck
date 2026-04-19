/**
 * Single place to enable/disable product modules (nav + agent tools).
 * Re-enable `iam` later by setting enabled: true and restoring routes/AWS code.
 */

export type ModuleId =
  | "platforms"
  | "secrets"
  | "amplify"
  | "audit"
  | "settings"
  | "iam"
  | "github";

export type NavIconId =
  | "dashboard"
  | "aws"
  | "secrets"
  | "search"
  | "insights"
  | "amplify"
  | "table"
  | "audit"
  | "shield"
  | "arrowsExchange"
  | "userPlus"
  | "github"
  | "playCircle"
  | "listRuns"
  | "gitBranch"
  | "settings";

/** Sub-links under a collapsible nav row (e.g. IAM utilities under Overview). */
export interface NavChildItem {
  href: string;
  label: string;
  icon: NavIconId;
}

export interface NavItemDef {
  href: string;
  label: string;
  icon: NavIconId;
  /** When set, Sidebar shows count from data resolver */
  badge?: "secretsCount";
  /** When set, Sidebar renders a collapsible group: parent row links to `href`, children nest below */
  children?: NavChildItem[];
}

export interface ModuleNavSection {
  id: ModuleId;
  enabled: boolean;
  /** Legacy; sidebar uses SIDEBAR_SERVICE_GROUPS — keep empty for grouped modules */
  sectionLabel: string;
  items: NavItemDef[];
  /** Render in sidebar footer (e.g. Settings) */
  footer?: boolean;
}

/**
 * Sidebar hierarchy: service tier (AWS, GitHub) first; module items nest under each.
 * Order within `moduleIds` is top-to-bottom under that service.
 */
export const SIDEBAR_SERVICE_GROUPS: { title: string; moduleIds: ModuleId[] }[] = [
  { title: "AWS", moduleIds: ["platforms", "secrets", "amplify", "audit", "iam"] },
  { title: "GitHub", moduleIds: ["github"] },
];

export const MODULE_NAV: ModuleNavSection[] = [
  {
    id: "platforms",
    enabled: true,
    sectionLabel: "",
    items: [{ href: "/aws", label: "Overview", icon: "aws" }],
  },
  {
    id: "secrets",
    enabled: true,
    sectionLabel: "",
    items: [
      {
        href: "/secrets",
        label: "Secrets Manager",
        icon: "secrets",
        badge: "secretsCount",
        children: [
          { href: "/secrets/search", label: "Value search", icon: "search" },
          { href: "/secrets/overview", label: "Insights", icon: "insights" },
        ],
      },
    ],
  },
  {
    id: "amplify",
    enabled: true,
    sectionLabel: "",
    items: [
      {
        href: "/amplify",
        label: "Amplify",
        icon: "amplify",
        children: [
          { href: "/amplify/search", label: "Env search", icon: "table" },
        ],
      },
    ],
  },
  {
    id: "audit",
    enabled: true,
    sectionLabel: "",
    items: [{ href: "/analyzer", label: "Access Analyzer", icon: "audit" }],
  },
  {
    id: "iam",
    enabled: true,
    sectionLabel: "",
    items: [
      {
        href: "/iam",
        label: "IAM",
        icon: "shield",
        children: [
          {
            href: "/iam/cross-account-copy",
            label: "Cross-account copy",
            icon: "arrowsExchange",
          },
          { href: "/iam/create-user", label: "Create user", icon: "userPlus" },
        ],
      },
    ],
  },
  {
    id: "github",
    enabled: true,
    sectionLabel: "",
    items: [
      {
        href: "/github/overview",
        label: "Overview",
        icon: "github",
        children: [
          { href: "/github", label: "Actions", icon: "playCircle" },
          { href: "/github/runs", label: "All runs", icon: "listRuns" },
          { href: "/github/workflows", label: "Workflows", icon: "gitBranch" },
        ],
      },
    ],
  },
  {
    id: "settings",
    enabled: true,
    sectionLabel: "",
    footer: true,
    items: [{ href: "/settings", label: "Settings", icon: "settings" }],
  },
];

export function getEnabledNavSections(): ModuleNavSection[] {
  return MODULE_NAV.filter((m) => m.enabled && !m.footer && m.items.length > 0);
}

export function getFooterNav(): NavItemDef[] {
  const mod = MODULE_NAV.find((m) => m.footer && m.enabled);
  return mod?.items ?? [];
}

/** Which high-level tool groups the agent may use (maps to entries in tools.ts). */
export type AgentToolGroup = "secrets" | "audit" | "cloudtrail" | "propose";

const MODULE_AGENT_TOOLS: Record<ModuleId, AgentToolGroup[]> = {
  platforms: [],
  secrets: ["secrets", "cloudtrail", "propose"],
  amplify: [],
  audit: ["audit", "propose"],
  settings: [],
  iam: [],
  github: [],
};

export function getEnabledAgentToolGroups(): Set<AgentToolGroup> {
  const set = new Set<AgentToolGroup>();
  for (const m of MODULE_NAV) {
    if (!m.enabled) continue;
    for (const g of MODULE_AGENT_TOOLS[m.id]) {
      set.add(g);
    }
  }
  return set;
}
