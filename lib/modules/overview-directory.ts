/**
 * Single source for dashboard directory, /aws overview, and /github/overview copy.
 * Hrefs align with MODULE_NAV in registry.ts; keep in sync when routes change.
 */

export type OverviewAccent = "accent" | "success" | "warn";

export interface DirectoryLink {
  href: string;
  label: string;
  description: string;
  /** Drive card strip / gradient on overview pages; optional on AWS directory links. */
  accent?: OverviewAccent;
}

/** Shared link-card shell for `/aws` and `/github/overview` (design tokens only). */
export function overviewAccentCardClass(accent: OverviewAccent): string {
  switch (accent) {
    case "success":
      return "border-(--success)/25 bg-[linear-gradient(135deg,var(--success-muted),transparent_60%)] hover:border-(--success)/40";
    case "warn":
      return "border-(--warn)/25 bg-[linear-gradient(135deg,var(--warn-muted),transparent_60%)] hover:border-(--warn)/40";
    default:
      return "border-(--accent)/20 bg-[linear-gradient(135deg,var(--accent-muted),transparent_60%)] hover:border-(--accent)/35";
  }
}

export interface DirectorySubsection {
  id: string;
  title: string;
  accent: OverviewAccent;
  links: DirectoryLink[];
}

export interface DirectoryGroup {
  id: "aws" | "github";
  title: string;
  lead: string;
  subsections: DirectorySubsection[];
}

const AWS_LEAD =
  "AWS tools in this workspace use your selected profile and region unless a screen says otherwise.";

const GITHUB_LEAD =
  "Monitor and control GitHub Actions across repos with the GitHub CLI token from Settings.";

/** Collapsible directory on the home page and data for service overviews. */
export const DIRECTORY_GROUPS: DirectoryGroup[] = [
  {
    id: "aws",
    title: "Amazon Web Services",
    lead: AWS_LEAD,
    subsections: [
      {
        id: "secrets",
        title: "Secrets Manager",
        accent: "accent",
        links: [
          {
            href: "/secrets",
            label: "Browse",
            description: "List, edit, and rotate secrets in the current account and region.",
          },
          {
            href: "/secrets/search",
            label: "Value search",
            description: "Search secret values and references across names and tags.",
          },
          {
            href: "/secrets/overview",
            label: "Workspace insights",
            description: "Rotation coverage, tagging, stale access, and triage shortcuts.",
          },
        ],
      },
      {
        id: "amplify",
        title: "Amplify",
        accent: "success",
        links: [
          {
            href: "/amplify",
            label: "Browse",
            description: "List Amplify Gen 1 apps and open branch environment configuration.",
          },
          {
            href: "/amplify/search",
            label: "Env search",
            description: "Search environment variables across apps and branches.",
          },
        ],
      },
      {
        id: "audit",
        title: "Audit",
        accent: "warn",
        links: [
          {
            href: "/analyzer",
            label: "Access Analyzer",
            description: "Review IAM Access Analyzer findings for unused access and external access.",
          },
        ],
      },
      {
        id: "iam",
        title: "IAM utilities",
        accent: "accent",
        links: [
          {
            href: "/iam",
            label: "Overview",
            description: "Jump off point for IAM tools scoped to your named profiles.",
          },
          {
            href: "/iam/cross-account-copy",
            label: "Cross-account copy",
            description: "Copy roles, users, and policies between accounts with optional overwrite.",
          },
          {
            href: "/iam/create-user",
            label: "Create user",
            description: "Create users with console login, keys, and permissions from a template.",
          },
        ],
      },
    ],
  },
  {
    id: "github",
    title: "GitHub",
    lead: GITHUB_LEAD,
    subsections: [
      {
        id: "github-hub",
        title: "GitHub",
        accent: "accent",
        links: [
          {
            href: "/github/overview",
            label: "Overview",
            description: "What this app can do with GitHub Actions and where to configure access.",
            accent: "accent",
          },
          {
            href: "/github",
            label: "Actions",
            description: "Live runs, cancel, re-run, and workflow health across connected repos.",
            accent: "success",
          },
          {
            href: "/github/runs",
            label: "All runs",
            description: "Flattened run list with filters and sort across repositories.",
            accent: "warn",
          },
          {
            href: "/github/workflows",
            label: "Workflows",
            description: "Browse workflows, enable or disable, and open dispatch where supported.",
            accent: "accent",
          },
        ],
      },
    ],
  },
];

/** Flat links for /aws — one card per link, grouped by subsection title in the page. */
export function getAwsOverviewSubsections(): DirectorySubsection[] {
  const aws = DIRECTORY_GROUPS.find((g) => g.id === "aws");
  return aws?.subsections ?? [];
}

export function getAwsOverviewLead(): string {
  const aws = DIRECTORY_GROUPS.find((g) => g.id === "aws");
  return aws?.lead ?? AWS_LEAD;
}

/** Links for /github/overview (intro + same as directory GitHub links). */
export function getGithubOverviewLinks(): DirectoryLink[] {
  const gh = DIRECTORY_GROUPS.find((g) => g.id === "github");
  const links = gh?.subsections[0]?.links ?? [];
  return links;
}

export function getGithubOverviewLead(): string {
  const gh = DIRECTORY_GROUPS.find((g) => g.id === "github");
  return gh?.lead ?? GITHUB_LEAD;
}
