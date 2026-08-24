/** Shared Fly.io overview links and accent-card styling. */

export type OverviewAccent = "accent" | "success" | "warn";

export interface DirectoryLink {
  href: string;
  label: string;
  description: string;
  /** Drive card strip / gradient on overview pages; optional on AWS directory links. */
  accent?: OverviewAccent;
}

export interface DirectorySubsection {
  id: string;
  title: string;
  accent: OverviewAccent;
  links: DirectoryLink[];
}

export interface DirectoryGroup {
  id: "aws" | "github" | "fly";
  title: string;
  lead: string;
  subsections: DirectorySubsection[];
}

/** Shared link-card shell for overview pages (design tokens only). */
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

const FLY_LEAD =
  "Monitor Fly.io apps and manage secrets using the local flyctl CLI session.";

/** Compatibility data for retained directory components; only Fly.io remains. */
export const DIRECTORY_GROUPS: DirectoryGroup[] = [
  {
    id: "fly",
    title: "Fly.io",
    lead: FLY_LEAD,
    subsections: [
      {
        id: "fly-hub",
        title: "Fly.io",
        accent: "accent",
        links: [
          {
            href: "/fly/secrets",
            label: "Secrets",
            description: "List, set, and remove encrypted runtime secrets for any Fly app.",
            accent: "accent",
          },
        ],
      },
    ],
  },
];

export function getFlyOverviewLinks(): DirectoryLink[] {
  return [
    {
      href: "/settings",
      label: "Settings",
      description: "Workspace paths, tokens, and tooling preferences used with flyctl.",
      accent: "accent",
    },
    {
      href: "/fly/secrets",
      label: "Secrets",
      description: "List, set, and remove encrypted runtime secrets for any Fly app.",
      accent: "accent",
    },
  ];
}

export function getFlyOverviewLead(): string {
  return FLY_LEAD;
}
