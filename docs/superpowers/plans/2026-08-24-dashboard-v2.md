# Dashboard v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home tool directory with a Needs attention inbox and collapse AWS Secrets and Amplify split views onto one route each, with redirects off the old hubs.

**Architecture:** Pure builders in `lib/dashboard/exceptions.ts` turn existing secrets metadata, GitHub runs, and Fly app status into one exception list. Home is a client composition of `DataProvider`, `GithubDataProvider` (one-shot fetch on `/`, no polling), and `GET /api/fly/apps?status=1`. Secrets and Amplify keep their tables and add insights / search as URL modes. Legacy routes call `redirect()` via `legacyDashboardRedirect`. No new list APIs.

**Tech Stack:** Next.js 16 App Router, React 19 client components, existing `/api/*` routes, Vitest (`npm run test`, `lib/**/*.test.ts` only), Flightdeck tokens.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-24-dashboard-v2-design.md` — follow it when this plan and the spec disagree on product behavior.
- No `lib/aws/*`, `lib/fly/cli.ts`, or `lib/github/client.ts` in `"use client"` files.
- Page `h1`: `text-2xl font-medium font-(family-name:--font-display)`. Cards `rounded-xl shadow-sm`. Buttons `rounded-lg`. Primary `bg-(--accent) text-white hover:opacity-90`. Focus `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20`.
- No decorative blurs, gradient tool cards, `text-3xl` page titles, or `rounded-2xl` marketing headers.
- No secrets hero tile. Home may have a hero (attention count).
- Do not load secret values or Amplify env search on first paint.
- Do not add Analyzer, IAM, or Route 53 certs to `/`.
- Do not merge GitHub Actions / runs / workflows or change GitHub/Fly secrets pages.
- After source edits: `npx tsc --noEmit`, `npm run lint`, `graphify auto-update .`.
- Registry + `overview-directory.ts` remain the nav/link sources of truth.

---

## File structure

| File | Responsibility |
|---|---|
| `lib/dashboard/exceptions.ts` | `ExceptionRow`, builders, merge, KPIs. Client-safe. |
| `lib/dashboard/exceptions.test.ts` | Builder/merge tests with frozen `nowMs`. |
| `lib/dashboard/legacy-redirect.ts` | Map old paths + `q` → new href. |
| `lib/dashboard/legacy-redirect.test.ts` | Redirect table tests. |
| `lib/secrets/page-url.ts` | `/secrets` href + parse `mode`/`filter`/`q`. |
| `lib/secrets/page-url.test.ts` | URL helper tests. |
| `lib/amplify/page-url.ts` | `/amplify` href + parse `mode`/`q`. |
| `lib/amplify/page-url.test.ts` | URL helper tests. |
| `components/dashboard/needs-attention.tsx` | Home context, KPI strip, exception list. |
| `components/secrets/insights-panel.tsx` | Equal tiles + triage (no hero). |
| `components/secrets/value-search-panel.tsx` | Moved value-search UI. |
| `components/amplify/env-search-panel.tsx` | Moved env-search UI. |
| `app/page.tsx` | Renders `NeedsAttentionDashboard`. |
| `app/aws/page.tsx`, `app/github/overview/page.tsx`, `app/secrets/overview/page.tsx`, `app/secrets/search/page.tsx`, `app/amplify/search/page.tsx` | `redirect()` only. |
| `app/secrets/page.tsx` | Insights + browse or value-search mode. |
| `app/amplify/page.tsx` | App list or env-search mode. |
| `lib/modules/registry.ts` | IA: no secrets/amplify children; GitHub hub `/github`; AWS `expandOnly`. |
| `lib/modules/overview-directory.ts` | Fly links + `overviewAccentCardClass` only. |
| `components/layout/sidebar.tsx` | AWS header is a toggle, not a link. Active-state cleanup. |
| `components/layout/shell.tsx` | Drop live `awsOverview` / `githubOverview` page ids. |
| `lib/nav/aws-workspace-topbar.ts` | Remove `/aws`. Do not add `/`. |
| `lib/context/github-data-provider.tsx` | One-shot fetch on `/`. Poll only on `/github/*`. |
| `CODEBASE.md`, `.cursor/rules/nav-and-overviews.mdc` | Map the new IA. |
| Delete `components/dashboard/platform-spotlights.tsx`, `components/dashboard/service-directory.tsx` | Dead directory UI. |

---

### Task 1: Exception builders

**Files:**
- Create: `lib/dashboard/exceptions.ts`
- Test: `lib/dashboard/exceptions.test.ts`

**Interfaces:**
- Consumes: `SecretEntry` (`lib/types.ts`), `GHWorkflowRun` (`lib/github/types.ts`), `EnrichedFlyApp` (`lib/fly/types.ts`)
- Produces: types and functions listed in the implementation block below

- [ ] **Step 1: Write the failing test**

Create `lib/dashboard/exceptions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SecretEntry } from "@/lib/types";
import type { GHWorkflowRun } from "@/lib/github/types";
import type { EnrichedFlyApp } from "@/lib/fly/types";
import {
  buildFlyExceptions,
  buildGithubExceptions,
  buildSecretsExceptions,
  filterRowsBySource,
  flyUnhealthyCount,
  githubKpis,
  mergeExceptions,
  secretsHygieneStats,
} from "./exceptions";

const NOW = Date.parse("2026-08-24T12:00:00.000Z");

function secret(partial: Partial<SecretEntry> & Pick<SecretEntry, "name">): SecretEntry {
  return {
    arn: `arn:aws:secretsmanager:us-east-1:1:secret:${partial.name}`,
    createdDate: "2026-01-01T00:00:00.000Z",
    tags: {},
    rotationEnabled: true,
    ...partial,
  };
}

function run(
  partial: Partial<GHWorkflowRun> & Pick<GHWorkflowRun, "id" | "status" | "conclusion">,
): GHWorkflowRun {
  return {
    name: null,
    workflowName: "deploy",
    workflowId: 1,
    repoFullName: "acme/app",
    headBranch: "main",
    headSha: "abc",
    event: "push",
    createdAt: "2026-08-24T11:00:00.000Z",
    updatedAt: "2026-08-24T11:30:00.000Z",
    runAttempt: 1,
    htmlUrl: "https://github.com/acme/app/actions/runs/1",
    runNumber: 1,
    actor: null,
    ...partial,
  };
}

function fly(name: string, health: "healthy" | "degraded" | "down" | "unknown" | null): EnrichedFlyApp {
  return {
    name,
    status: "running",
    deployed: true,
    hostname: `${name}.fly.dev`,
    org: "o",
    orgSlug: "o",
    currentReleaseStatus: "complete",
    currentReleaseAt: "2026-08-01T00:00:00.000Z",
    status_detail: health
      ? {
          appName: name,
          hostname: `${name}.fly.dev`,
          deployed: true,
          machines: [],
          health,
        }
      : null,
  };
}

describe("githubKpis / buildGithubExceptions", () => {
  it("counts failed-in-24h and live separately; skips old failures", () => {
    const runs = [
      run({ id: 1, status: "completed", conclusion: "failure" }),
      run({
        id: 2,
        status: "completed",
        conclusion: "failure",
        updatedAt: "2026-08-20T12:00:00.000Z",
      }),
      run({ id: 3, status: "in_progress", conclusion: null }),
    ];
    expect(githubKpis(runs, NOW)).toEqual({ failed24h: 1, live: 1 });
    const rows = buildGithubExceptions(runs, NOW);
    expect(rows.map((r) => r.id)).toEqual(["github-fail-1", "github-live-3"]);
    expect(rows[0]?.href).toBe("/github");
    expect(rows[0]?.severity).toBe("danger");
    expect(rows[1]?.severity).toBe("warn");
  });
});

describe("secretsHygieneStats / buildSecretsExceptions", () => {
  it("hygiene is union of unrotated and stale", () => {
    const secrets = [
      secret({ name: "a", rotationEnabled: false }),
      secret({ name: "b", lastAccessedDate: "2025-01-01T00:00:00.000Z" }),
      secret({
        name: "both",
        rotationEnabled: false,
        lastAccessedDate: "2025-01-01T00:00:00.000Z",
      }),
      secret({ name: "ok" }),
    ];
    expect(secretsHygieneStats(secrets, NOW)).toEqual({
      unrotated: 2,
      stale: 2,
      hygiene: 3,
    });
  });

  it("aggregates unrotated when count > 5", () => {
    const secrets = Array.from({ length: 6 }, (_, i) =>
      secret({ name: `u${i}`, rotationEnabled: false }),
    );
    const { rows } = buildSecretsExceptions(secrets, NOW);
    expect(rows.filter((r) => r.id.startsWith("secrets-unrotated"))).toHaveLength(1);
    expect(rows[0]?.href).toBe("/secrets?filter=no-rotation");
    expect(rows[0]?.label).toBe("6 secrets without auto-rotation");
  });

  it("caps stale rows at 8 and reports omittedStale", () => {
    const secrets = Array.from({ length: 10 }, (_, i) =>
      secret({
        name: `s${i}`,
        lastAccessedDate: `2025-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
    const { rows, omittedStale } = buildSecretsExceptions(secrets, NOW);
    expect(rows.filter((r) => r.id.startsWith("secrets-stale-"))).toHaveLength(8);
    expect(omittedStale).toBe(2);
  });
});

describe("buildFlyExceptions / flyUnhealthyCount", () => {
  it("includes degraded and down only", () => {
    const apps = [
      fly("ok", "healthy"),
      fly("bad", "degraded"),
      fly("dead", "down"),
      fly("mystery", "unknown"),
      fly("empty", null),
    ];
    expect(flyUnhealthyCount(apps)).toBe(2);
    const rows = buildFlyExceptions(apps);
    expect(rows.map((r) => r.id)).toEqual(["fly-bad", "fly-dead"]);
    expect(rows.every((r) => r.href === "/fly/overview")).toBe(true);
  });
});

describe("mergeExceptions", () => {
  it("sorts danger then warn then info, then recency desc; caps at 15; hero total includes omitted stale", () => {
    const runs = Array.from({ length: 12 }, (_, i) =>
      run({
        id: i + 1,
        status: "completed",
        conclusion: "failure",
        updatedAt: new Date(NOW - i * 60_000).toISOString(),
      }),
    );
    const gh = buildGithubExceptions(runs, NOW);
    const secrets = Array.from({ length: 10 }, (_, i) =>
      secret({
        name: `stale-${i}`,
        lastAccessedDate: "2025-01-01T00:00:00.000Z",
      }),
    );
    const { rows, omittedStale } = buildSecretsExceptions(secrets, NOW);
    const merged = mergeExceptions([...gh, ...rows], omittedStale);
    expect(merged.visible).toHaveLength(15);
    expect(merged.total).toBe(gh.length + rows.length + omittedStale);
    expect(merged.visible[0]?.severity).toBe("danger");
    expect(merged.overflow.some((o) => o.source === "secrets" && o.count >= 2)).toBe(true);
  });
});

describe("filterRowsBySource", () => {
  it("returns all rows when source is null", () => {
    const rows = buildFlyExceptions([fly("bad", "down")]);
    expect(filterRowsBySource(rows, null)).toEqual(rows);
    expect(filterRowsBySource(rows, "github")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/dashboard/exceptions.test.ts`

Expected: FAIL — `Cannot find module './exceptions'` or export not found.

- [ ] **Step 3: Write minimal implementation**

Create `lib/dashboard/exceptions.ts`:

```ts
import type { SecretEntry } from "@/lib/types";
import type { GHWorkflowRun } from "@/lib/github/types";
import type { EnrichedFlyApp } from "@/lib/fly/types";

export const STALE_DAYS = 180;
export const EXCEPTION_LIST_CAP = 15;
export const UNROTATED_EXPAND_MAX = 5;
export const STALE_EXPAND_MAX = 8;
export const FAILED_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ExceptionSeverity = "danger" | "warn" | "info";
export type ExceptionSource = "github" | "secrets" | "fly";

export interface ExceptionRow {
  id: string;
  severity: ExceptionSeverity;
  source: ExceptionSource;
  label: string;
  ageLabel: string | null;
  href: string;
  actionLabel: string;
  sortTimeMs: number;
}

export interface OverflowLine {
  source: ExceptionSource;
  count: number;
  href: string;
}

const SEVERITY_ORDER: Record<ExceptionSeverity, number> = {
  danger: 0,
  warn: 1,
  info: 2,
};

const SOURCE_HREF: Record<ExceptionSource, string> = {
  github: "/github",
  secrets: "/secrets",
  fly: "/fly/overview",
};

export function ageLabelFromMs(thenMs: number, nowMs: number): string {
  const seconds = Math.floor((nowMs - thenMs) / 1000);
  if (seconds < 60) return "just now";
  const intervals: [number, string][] = [
    [31536000, "y"],
    [2592000, "mo"],
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ];
  for (const [unit, label] of intervals) {
    const count = Math.floor(seconds / unit);
    if (count >= 1) return `${count}${label} ago`;
  }
  return "just now";
}

export function daysSinceAt(isoString: string, nowMs: number): number {
  return Math.floor((nowMs - new Date(isoString).getTime()) / (1000 * 60 * 60 * 24));
}

function isFailedConclusion(conclusion: GHWorkflowRun["conclusion"]): boolean {
  return (
    conclusion === "failure" ||
    conclusion === "timed_out" ||
    conclusion === "startup_failure"
  );
}

function isLiveStatus(status: GHWorkflowRun["status"]): boolean {
  return (
    status === "in_progress" ||
    status === "queued" ||
    status === "waiting" ||
    status === "requested" ||
    status === "pending"
  );
}

export function isSecretStale(secret: SecretEntry, nowMs: number): boolean {
  if (!secret.lastAccessedDate) return false;
  return daysSinceAt(secret.lastAccessedDate, nowMs) > STALE_DAYS;
}

export function secretsHygieneStats(secrets: SecretEntry[], nowMs: number) {
  let unrotated = 0;
  let stale = 0;
  let hygiene = 0;
  for (const s of secrets) {
    const u = !s.rotationEnabled;
    const t = isSecretStale(s, nowMs);
    if (u) unrotated += 1;
    if (t) stale += 1;
    if (u || t) hygiene += 1;
  }
  return { unrotated, stale, hygiene };
}

export function githubKpis(runs: GHWorkflowRun[], nowMs: number) {
  let failed24h = 0;
  let live = 0;
  for (const r of runs) {
    if (isLiveStatus(r.status)) live += 1;
    if (
      isFailedConclusion(r.conclusion) &&
      nowMs - new Date(r.updatedAt).getTime() <= FAILED_WINDOW_MS
    ) {
      failed24h += 1;
    }
  }
  return { failed24h, live };
}

export function flyUnhealthyCount(apps: EnrichedFlyApp[]): number {
  return apps.filter((a) => {
    const h = a.status_detail?.health;
    return h === "degraded" || h === "down";
  }).length;
}

export function buildGithubExceptions(
  runs: GHWorkflowRun[],
  nowMs: number,
): ExceptionRow[] {
  const rows: ExceptionRow[] = [];
  for (const r of runs) {
    const updated = new Date(r.updatedAt).getTime();
    const name = r.workflowName || r.name || "workflow";
    if (isLiveStatus(r.status)) {
      rows.push({
        id: `github-live-${r.id}`,
        severity: "warn",
        source: "github",
        label: `${r.repoFullName} / ${name} live`,
        ageLabel: ageLabelFromMs(updated, nowMs),
        href: "/github",
        actionLabel: "Open",
        sortTimeMs: updated,
      });
      continue;
    }
    if (isFailedConclusion(r.conclusion) && nowMs - updated <= FAILED_WINDOW_MS) {
      rows.push({
        id: `github-fail-${r.id}`,
        severity: "danger",
        source: "github",
        label: `${r.repoFullName} / ${name} failed`,
        ageLabel: ageLabelFromMs(updated, nowMs),
        href: "/github",
        actionLabel: "Open",
        sortTimeMs: updated,
      });
    }
  }
  return rows;
}

export function buildSecretsExceptions(
  secrets: SecretEntry[],
  nowMs: number,
): { rows: ExceptionRow[]; omittedStale: number } {
  const unrotated = secrets.filter((s) => !s.rotationEnabled);
  const staleSorted = secrets
    .filter((s) => isSecretStale(s, nowMs))
    .sort(
      (a, b) =>
        daysSinceAt(b.lastAccessedDate!, nowMs) - daysSinceAt(a.lastAccessedDate!, nowMs),
    );

  const rows: ExceptionRow[] = [];

  if (unrotated.length > UNROTATED_EXPAND_MAX) {
    rows.push({
      id: "secrets-unrotated-aggregate",
      severity: "warn",
      source: "secrets",
      label: `${unrotated.length} secrets without auto-rotation`,
      ageLabel: null,
      href: "/secrets?filter=no-rotation",
      actionLabel: "Review",
      sortTimeMs: 0,
    });
  } else {
    for (const s of unrotated) {
      const t = s.lastChangedDate ?? s.createdDate;
      rows.push({
        id: `secrets-unrotated-${s.name}`,
        severity: "warn",
        source: "secrets",
        label: `${s.name} without auto-rotation`,
        ageLabel: t ? ageLabelFromMs(new Date(t).getTime(), nowMs) : null,
        href: `/secrets/${encodeURIComponent(s.name)}`,
        actionLabel: "View",
        sortTimeMs: t ? new Date(t).getTime() : 0,
      });
    }
  }

  const shownStale = staleSorted.slice(0, STALE_EXPAND_MAX);
  const omittedStale = Math.max(0, staleSorted.length - shownStale.length);
  for (const s of shownStale) {
    const d = daysSinceAt(s.lastAccessedDate!, nowMs);
    rows.push({
      id: `secrets-stale-${s.name}`,
      severity: "info",
      source: "secrets",
      label: `${s.name} not accessed in ${d} days`,
      ageLabel: `${d}d ago`,
      href: `/secrets/${encodeURIComponent(s.name)}`,
      actionLabel: "View",
      sortTimeMs: new Date(s.lastAccessedDate!).getTime(),
    });
  }

  return { rows, omittedStale };
}

export function buildFlyExceptions(apps: EnrichedFlyApp[]): ExceptionRow[] {
  const rows: ExceptionRow[] = [];
  for (const a of apps) {
    const h = a.status_detail?.health;
    if (h !== "degraded" && h !== "down") continue;
    rows.push({
      id: `fly-${a.name}`,
      severity: "danger",
      source: "fly",
      label: `${a.name} ${h}`,
      ageLabel: null,
      href: "/fly/overview",
      actionLabel: "Open",
      sortTimeMs: 0,
    });
  }
  return rows;
}

export function mergeExceptions(
  rows: ExceptionRow[],
  omittedStale = 0,
): {
  visible: ExceptionRow[];
  total: number;
  overflow: OverflowLine[];
  hasDanger: boolean;
} {
  const sorted = [...rows].sort((a, b) => {
    const sd = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sd !== 0) return sd;
    return b.sortTimeMs - a.sortTimeMs;
  });
  const visible = sorted.slice(0, EXCEPTION_LIST_CAP);
  const hidden = sorted.slice(EXCEPTION_LIST_CAP);
  const overflowCounts: Record<ExceptionSource, number> = {
    github: 0,
    secrets: omittedStale,
    fly: 0,
  };
  for (const r of hidden) overflowCounts[r.source] += 1;

  const overflow: OverflowLine[] = (["github", "secrets", "fly"] as ExceptionSource[])
    .filter((s) => overflowCounts[s] > 0)
    .map((s) => ({
      source: s,
      count: overflowCounts[s],
      href: s === "secrets" && omittedStale > 0 ? "/secrets?filter=stale" : SOURCE_HREF[s],
    }));

  return {
    visible,
    total: sorted.length + omittedStale,
    overflow,
    hasDanger: sorted.some((r) => r.severity === "danger"),
  };
}

export function filterRowsBySource(
  rows: ExceptionRow[],
  source: ExceptionSource | null,
): ExceptionRow[] {
  if (!source) return rows;
  return rows.filter((r) => r.source === source);
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run lib/dashboard/exceptions.test.ts`

Expected: PASS (all describes green).

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/exceptions.ts lib/dashboard/exceptions.test.ts
git commit -m "feat: add dashboard exception builders for home inbox"
```

---

### Task 2: Legacy redirect helper and pages

**Files:**
- Create: `lib/dashboard/legacy-redirect.ts`
- Test: `lib/dashboard/legacy-redirect.test.ts`
- Modify: `app/aws/page.tsx` (replace entire file)
- Modify: `app/github/overview/page.tsx` (replace entire file)
- Modify: `app/secrets/overview/page.tsx` (replace entire file)
- Modify: `app/secrets/search/page.tsx` (replace entire file)
- Modify: `app/amplify/search/page.tsx` (replace entire file)

**Interfaces:**
- Consumes: none
- Produces: `legacyDashboardRedirect(from, query): string`

- [ ] **Step 1: Write the failing test**

Create `lib/dashboard/legacy-redirect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { legacyDashboardRedirect } from "./legacy-redirect";

describe("legacyDashboardRedirect", () => {
  it("maps hubs without query", () => {
    expect(legacyDashboardRedirect("/aws", {})).toBe("/");
    expect(legacyDashboardRedirect("/github/overview", {})).toBe("/github");
    expect(legacyDashboardRedirect("/secrets/overview", {})).toBe("/secrets");
    expect(legacyDashboardRedirect("/secrets/search", {})).toBe("/secrets?mode=values");
    expect(legacyDashboardRedirect("/amplify/search", {})).toBe("/amplify?mode=search");
  });

  it("forwards q on search routes", () => {
    expect(legacyDashboardRedirect("/secrets/search", { q: "TOKEN" })).toBe(
      "/secrets?mode=values&q=TOKEN",
    );
    expect(legacyDashboardRedirect("/amplify/search", { q: "API_KEY" })).toBe(
      "/amplify?mode=search&q=API_KEY",
    );
  });

  it("encodes q", () => {
    expect(legacyDashboardRedirect("/secrets/search", { q: "a b" })).toBe(
      "/secrets?mode=values&q=a%20b",
    );
  });

  it("ignores array q", () => {
    expect(legacyDashboardRedirect("/secrets/search", { q: ["x", "y"] })).toBe(
      "/secrets?mode=values",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/dashboard/legacy-redirect.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write helper and redirect pages**

Create `lib/dashboard/legacy-redirect.ts`:

```ts
export type LegacyRedirectFrom =
  | "/aws"
  | "/github/overview"
  | "/secrets/overview"
  | "/secrets/search"
  | "/amplify/search";

export function legacyDashboardRedirect(
  from: LegacyRedirectFrom,
  query: Record<string, string | string[] | undefined>,
): string {
  const q = typeof query.q === "string" ? query.q : undefined;
  switch (from) {
    case "/aws":
      return "/";
    case "/github/overview":
      return "/github";
    case "/secrets/overview":
      return "/secrets";
    case "/secrets/search":
      return q
        ? `/secrets?mode=values&q=${encodeURIComponent(q)}`
        : "/secrets?mode=values";
    case "/amplify/search":
      return q
        ? `/amplify?mode=search&q=${encodeURIComponent(q)}`
        : "/amplify?mode=search";
  }
}
```

Replace `app/aws/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { legacyDashboardRedirect } from "@/lib/dashboard/legacy-redirect";

export default function AwsRedirectPage() {
  redirect(legacyDashboardRedirect("/aws", {}));
}
```

Replace `app/github/overview/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { legacyDashboardRedirect } from "@/lib/dashboard/legacy-redirect";

export default function GithubOverviewRedirectPage() {
  redirect(legacyDashboardRedirect("/github/overview", {}));
}
```

Replace `app/secrets/overview/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { legacyDashboardRedirect } from "@/lib/dashboard/legacy-redirect";

export default function SecretsOverviewRedirectPage() {
  redirect(legacyDashboardRedirect("/secrets/overview", {}));
}
```

Replace `app/secrets/search/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { legacyDashboardRedirect } from "@/lib/dashboard/legacy-redirect";

export default async function SecretsSearchRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyDashboardRedirect("/secrets/search", await searchParams));
}
```

Replace `app/amplify/search/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { legacyDashboardRedirect } from "@/lib/dashboard/legacy-redirect";

export default async function AmplifySearchRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyDashboardRedirect("/amplify/search", await searchParams));
}
```

`/secrets` and `/amplify` do not understand `mode` yet. These redirects are still correct; Task 5 and 6 make the targets work. Until then, extra query params are ignored (browse still renders).

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/dashboard/legacy-redirect.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/legacy-redirect.ts lib/dashboard/legacy-redirect.test.ts \
  app/aws/page.tsx app/github/overview/page.tsx \
  app/secrets/overview/page.tsx app/secrets/search/page.tsx \
  app/amplify/search/page.tsx
git commit -m "feat: redirect directory hubs to needs-attention and combined views"
```

---

### Task 3: Nav, sidebar, shell, overview-directory

**Files:**
- Modify: `lib/modules/registry.ts`
- Modify: `lib/modules/overview-directory.ts`
- Modify: `components/layout/sidebar.tsx`
- Modify: `components/layout/shell.tsx`
- Modify: `lib/nav/aws-workspace-topbar.ts`
- Modify: `.cursor/rules/nav-and-overviews.mdc`

**Interfaces:**
- Consumes: `legacyDashboardRedirect` destinations (string hrefs only)
- Produces: `NavItemDef.expandOnly?: boolean`; GitHub hub href `/github`; Secrets/Amplify without children; Fly-only overview helpers

- [ ] **Step 1: Extend `NavItemDef` and update `MODULE_NAV`**

In `lib/modules/registry.ts`, add `expandOnly?: boolean` to `NavItemDef`.

Change platforms item to:

```ts
items: [{ href: "/aws", label: "AWS", icon: "aws", expandOnly: true }],
```

Change secrets `items` to a single item with **no** `children`:

```ts
items: [
  {
    href: "/secrets",
    label: "Secrets Manager",
    icon: "secrets",
    badge: "secretsCount",
  },
],
```

Change amplify `items` to a single item with **no** `children`:

```ts
items: [{ href: "/amplify", label: "Amplify", icon: "amplify" }],
```

Change GitHub parent `href` from `"/github/overview"` to `"/github"`. Keep children Actions `/github`, All runs, Workflows, Secrets.

- [ ] **Step 2: AWS header is a toggle**

In `components/layout/sidebar.tsx` `CollapsibleAwsSection`, replace the header `Link` with a `button type="button"` that calls `onToggleExpanded`. Do not navigate. Keep the chevron button as a second toggle (same handler) or merge into one control — both must only toggle.

```tsx
<button
  type="button"
  onClick={onToggleExpanded}
  aria-expanded={expanded}
  className={`${base} min-w-0 flex-1 items-center ${
    sectionActive ? activeClass : inactiveClass
  }`}
>
  <span className="text-current">{icons[headerItem.icon]}</span>
  <span className="min-w-0 flex-1 truncate">{headerItem.label}</span>
</button>
```

In `isNavActive`, delete branches for `/aws`, `/secrets/search`, `/secrets/overview`, `/amplify/search`, `/github/overview`.

Simplify `/secrets` to: `pathname === "/secrets" || pathname.startsWith("/secrets/")`.

Simplify `/amplify` to: `pathname === "/amplify" || pathname.startsWith("/amplify/")`.

In `routeInAwsSection`, delete `pathname === "/aws"`.

Keep `AWS_SECTION_EXPAND_KEY` and auto-expand on remaining AWS tool prefixes only (not `/`).

- [ ] **Step 3: Shell and AWS topbar**

In `components/layout/shell.tsx` `derivePageContext`:

- Delete the `pathname === "/aws"` and `pathname === "/github/overview"` branches.
- Keep `/secrets/search` and `/secrets/overview` only if you want agent context during the instant before redirect; prefer deleting them so leftover hits are `general` after redirect wins.

Change breadcrumb for `/` from `"Application dashboard"` to `"Needs attention"`.

In `lib/nav/aws-workspace-topbar.ts`, delete `if (pathname === "/aws") return true;`. Do **not** add `pathname === "/"`.

- [ ] **Step 4: Slim `overview-directory.ts`**

Keep `OverviewAccent`, `DirectoryLink`, `overviewAccentCardClass`, `getFlyOverviewLinks`, `getFlyOverviewLead`.

Remove `DIRECTORY_GROUPS` AWS/GitHub groups used only by deleted directories. Keep a Fly-only structure so Fly overview still works:

```ts
const FLY_LEAD =
  "Monitor Fly.io apps and manage secrets using the local flyctl CLI session.";

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
```

Delete `getAwsOverviewLead`, `getAwsOverviewSubsections`, `getGithubOverviewLead`, `getGithubOverviewLinks`, and `DIRECTORY_GROUPS` if nothing else imports them. `app/fly/overview/fly-overview-client.tsx` must keep compiling (`overviewAccentCardClass` + Fly getters).

- [ ] **Step 5: Update nav rule**

In `.cursor/rules/nav-and-overviews.mdc`, replace the dashboard / AWS / GitHub overview rows:

| Surface | File(s) |
|---|---|
| **App dashboard** (`/`) | Needs attention inbox — `components/dashboard/needs-attention.tsx`. Not a tool directory. |
| **AWS** | No hub page. Sidebar header is expand-only. Tools from `MODULE_NAV`. |
| **GitHub hub** | `/github` (Actions). Do not add `/github/overview`. |

Checklist item 2: update Fly helpers in `overview-directory.ts` when Fly links change. Do not mention keeping `/aws` card grids.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`

Expected: exit 0. Fix any leftover imports of deleted overview getters.

- [ ] **Step 7: Commit**

```bash
git add lib/modules/registry.ts lib/modules/overview-directory.ts \
  components/layout/sidebar.tsx components/layout/shell.tsx \
  lib/nav/aws-workspace-topbar.ts .cursor/rules/nav-and-overviews.mdc
git commit -m "feat: drop directory hubs from sidebar and overview directory"
```

---

### Task 4: Home Needs attention UI

**Files:**
- Create: `components/dashboard/needs-attention.tsx`
- Modify: `app/page.tsx`
- Modify: `lib/context/github-data-provider.tsx`
- Delete: `components/dashboard/platform-spotlights.tsx`
- Delete: `components/dashboard/service-directory.tsx`

**Interfaces:**
- Consumes: `buildGithubExceptions`, `buildSecretsExceptions`, `buildFlyExceptions`, `mergeExceptions`, `filterRowsBySource`, `githubKpis`, `secretsHygieneStats`, `flyUnhealthyCount`, `ExceptionSource` from `lib/dashboard/exceptions.ts`; `useData`; `useGithubData`; `useAwsWorkspace`; `EnrichedFlyApp`
- Produces: `NeedsAttentionDashboard` client component

- [ ] **Step 1: One-shot GitHub fetch on `/`**

In `lib/context/github-data-provider.tsx` `GithubDataController` effect, treat `/` as a one-shot fetch (no `scheduleNext` polling):

```ts
useEffect(() => {
  const onHome = pathname === "/";
  const onGithub = pathname.startsWith("/github");

  if (!onHome && !onGithub) {
    abortRef.current?.abort();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return;
  }

  const controller = new AbortController();
  abortRef.current = controller;
  void (async () => {
    await doFetch(controller.signal, { background: false });
    if (controller.signal.aborted) return;
    if (pathnameRef.current.startsWith("/github")) {
      scheduleNext.current();
    }
  })();

  const onVisibility = () => {
    if (document.visibilityState !== "visible") return;
    if (!pathnameRef.current.startsWith("/github")) return;
    // existing github visibility refresh — unchanged
  };
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    controller.abort();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    document.removeEventListener("visibilitychange", onVisibility);
  };
}, [pathname, doFetch]);
```

Keep the existing `visibilitychange` handler body as it is today (only `/github`). Do not poll on `/`.

Also keep `scheduleNext`’s guard `if (!pathnameRef.current.startsWith("/github")) return;`.

- [ ] **Step 2: Implement `NeedsAttentionDashboard`**

Create `components/dashboard/needs-attention.tsx` as a `"use client"` module.

Behavior (must match spec):

1. `useSearchParams` + `useRouter`: `source` query is `github` | `secrets` | `fly` or absent. Tile click sets `?source=` (or clears if clicking the active filter).
2. Secrets: `useData()`. If `secrets.length === 0` and not loading and no error, call `loadSecrets()` once on mount (DataProvider usually already loaded).
3. GitHub: `useGithubData()`. If `error` is set, GitHub tile shows the error + Retry (`refresh`), **not** a healthy `0`.
4. Fly: `useEffect` fetch `GET /api/fly/apps?status=1`. Type response `{ apps?: EnrichedFlyApp[]; error?: string }`. On 401 or `error` containing auth, message: `Fly CLI is not authenticated` and a Settings link. Store `flyError`, `flyLoading`, `flyApps`, `flyFetchedAt` (ISO when success).
5. `nowMs = Date.now()` at render is fine for UI (builders are tested with frozen time).
6. Build rows only from **successful** slices. Failed slices contribute zero rows.
7. `filterRowsBySource` then `mergeExceptions`. When `source` is `null` or `secrets`, pass `omittedStale`; otherwise pass `0`.
8. Hero value = `merged.total`. Color: default text unless `merged.total > 0 && merged.hasDanger` — then `text-(--danger)` **and** visible label “need action”.
9. Supporting tiles: GitHub `failed24h` + sub live count if `live > 0`; Secrets `hygiene` + sub `{unrotated} unrotated / {stale} stale`; Fly `flyUnhealthyCount` + sub `{n} apps`.
10. Last-updated: GitHub `fetchedAt` via `relativeTime`; secrets latest `lastChangedDate || createdDate`; Fly `flyFetchedAt`. Show per tile, not one global clock if they differ.
11. List: 15 rows — platform word, label, age, action `Link`. Overflow lines: `{count} more on {GitHub|Secrets|Fly}` → `overflow.href`.
12. Empty (all slices succeeded, `merged.total === 0`): one line “Nothing needs attention.”
13. Loading: if a slice is loading and has no data, skeleton that slice’s tile and 5 list rows. Do not collapse the page. Do not wait for all three to paint the others.
14. Layout tokens: `h1` Needs attention; subtitle “Which item do I open first?”; context labels for AWS profile/region (`useAwsWorkspace`), “GitHub CLI”, “Fly CLI”. No blurs, no `text-3xl`, no `rounded-2xl`.

Skeleton tile:

```tsx
<div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm">
  <div className="mb-2 h-3 w-16 animate-pulse rounded bg-(--bg-muted)" />
  <div className="h-8 w-12 animate-pulse rounded bg-(--bg-muted)" />
</div>
```

Hero tile: `sm:col-span-2` (or larger type) vs three compact tiles.

Severity dot: `bg-(--danger)` / `bg-(--warn)` / `bg-(--accent)` plus `aria-label={severity}`.

- [ ] **Step 3: Replace `app/page.tsx`**

```tsx
"use client";

import { Suspense } from "react";
import { NeedsAttentionDashboard } from "@/components/dashboard/needs-attention";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="h-8 w-48 animate-pulse rounded bg-(--bg-muted)" />
          <div className="grid gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-xl bg-(--bg-muted)"
              />
            ))}
          </div>
        </div>
      }
    >
      <NeedsAttentionDashboard />
    </Suspense>
  );
}
```

`useSearchParams` requires `Suspense`.

Delete `components/dashboard/platform-spotlights.tsx` and `components/dashboard/service-directory.tsx`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/needs-attention.tsx app/page.tsx \
  lib/context/github-data-provider.tsx
git rm components/dashboard/platform-spotlights.tsx \
  components/dashboard/service-directory.tsx
git commit -m "feat: replace home directory with needs-attention inbox"
```

---

### Task 5: Combined AWS Secrets page

**Files:**
- Create: `lib/secrets/page-url.ts`
- Test: `lib/secrets/page-url.test.ts`
- Create: `components/secrets/insights-panel.tsx`
- Create: `components/secrets/value-search-panel.tsx`
- Modify: `app/secrets/page.tsx`

**Interfaces:**
- Consumes: `secretsHygieneStats`, `isSecretStale`, `STALE_DAYS` from `lib/dashboard/exceptions.ts`; existing create/bulk UI in `app/secrets/page.tsx`
- Produces: `secretsHref`, `parseSecretsBrowseFilter`, `SecretsBrowseFilter`; insights + value-search panels

- [ ] **Step 1: Write URL helper tests**

Create `lib/secrets/page-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseSecretsBrowseFilter, parseSecretsMode, secretsHref } from "./page-url";

describe("secretsHref", () => {
  it("browse default has no query", () => {
    expect(secretsHref()).toBe("/secrets");
    expect(secretsHref({ filter: "all" })).toBe("/secrets");
  });

  it("browse filter and values mode are mutually exclusive", () => {
    expect(secretsHref({ filter: "stale" })).toBe("/secrets?filter=stale");
    expect(secretsHref({ mode: "values", filter: "stale", q: "x" })).toBe(
      "/secrets?mode=values&q=x",
    );
  });
});

describe("parsers", () => {
  it("accepts known filters and modes", () => {
    expect(parseSecretsBrowseFilter("no-rotation")).toBe("no-rotation");
    expect(parseSecretsBrowseFilter("nope")).toBe("all");
    expect(parseSecretsMode("values")).toBe("values");
    expect(parseSecretsMode(null)).toBe("browse");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/secrets/page-url.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/secrets/page-url.ts`**

```ts
export type SecretsBrowseFilter =
  | "all"
  | "dev"
  | "staging"
  | "prod"
  | "no-rotation"
  | "stale";

export type SecretsPageMode = "browse" | "values";

const FILTERS = new Set<SecretsBrowseFilter>([
  "all",
  "dev",
  "staging",
  "prod",
  "no-rotation",
  "stale",
]);

export function parseSecretsBrowseFilter(raw: string | null): SecretsBrowseFilter {
  if (raw && FILTERS.has(raw as SecretsBrowseFilter)) return raw as SecretsBrowseFilter;
  return "all";
}

export function parseSecretsMode(raw: string | null): SecretsPageMode {
  return raw === "values" ? "values" : "browse";
}

export function secretsHref(opts: {
  mode?: SecretsPageMode;
  filter?: SecretsBrowseFilter;
  q?: string;
} = {}): string {
  const params = new URLSearchParams();
  if (opts.mode === "values") {
    params.set("mode", "values");
    if (opts.q) params.set("q", opts.q);
  } else if (opts.filter && opts.filter !== "all") {
    params.set("filter", opts.filter);
  }
  const qs = params.toString();
  return qs ? `/secrets?${qs}` : "/secrets";
}
```

- [ ] **Step 4: Run URL tests**

Run: `npx vitest run lib/secrets/page-url.test.ts`

Expected: PASS.

- [ ] **Step 5: Insights panel (no hero)**

Create `components/secrets/insights-panel.tsx` (`"use client"`).

Props:

```ts
{
  total: number;
  rotationPct: number;
  staleCount: number;
  unrotatedCount: number;
  staleNames: { name: string; days: number }[];
  filter: SecretsBrowseFilter;
  onFilter: (filter: SecretsBrowseFilter) => void;
}
```

Three equal `rounded-xl` tiles: Total, Rotation % (`Math.round`), Stale. Click sets `onFilter("all" | "no-rotation" | "stale")`.

Triage list under the tiles:

- If `unrotatedCount > 0`: one row “N secrets without auto-rotation” → `onFilter("no-rotation")` (do not link to `/secrets/overview`).
- Stale names (caller passes at most 8): each row links to `/secrets/${encodeURIComponent(name)}`.
- `j`/`k` + Enter on triage only, same as old overview (focus index state lives in this panel).

Reuse tile chrome from old overview `StatCard` but **no** accent/success/warn filled hero variant. All three use `border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm`.

- [ ] **Step 6: Value search panel**

Move the UI and `doSearch` / highlight / bulk-edit from the **previous** `app/secrets/search/page.tsx` (git: `af4c15c` or `HEAD` before Task 2) into `components/secrets/value-search-panel.tsx`.

Required changes vs the old page:

- No page `h1` (parent owns title).
- Error copy: “Couldn’t search values. Retry.” + retry button. No raw gateway codes.
- Accept optional `initialQuery` from URL `q`. Do **not** fetch until submit (if `initialQuery` is present, prefill the input; fetch only on submit or if you add an explicit “Search” on mount when `q` is non-empty — **only after the operator landed with `q` from a redirect they already searched**. Prefill only is enough; do not auto-fetch on first paint of `/secrets` without `q`).
- When `q` is in the URL from redirect after a search intent, one fetch on mount **if `q` is non-empty** is allowed (operator already searched). `/secrets?mode=values` with no `q` must not call `POST /api/secrets/values`.

Keep `BulkEditModal` and selection.

- [ ] **Step 7: Compose `app/secrets/page.tsx`**

Wrap the existing page in `Suspense` if it uses `useSearchParams` (inner content component).

On the inner page:

```ts
const params = useSearchParams();
const router = useRouter();
const mode = parseSecretsMode(params.get("mode"));
const filter = parseSecretsBrowseFilter(params.get("filter"));
```

- Replace local `useState` filter with URL `filter` via `router.replace(secretsHref({ filter }))`.
- Remember last browse filter in a `useRef` when switching to values mode; “Browse” control calls `secretsHref({ filter: lastFilter })`.
- Remove links to `/secrets/overview` and `/secrets/search`.
- Sticky filter bar (`sticky top-0 z-10 -mx-8 bg-(--bg-deep)/90 px-8 py-3 backdrop-blur-sm border-b border-(--border-hairline)`): search input, env chips (hidden when `mode === "values"`), button “Search values” → `secretsHref({ mode: "values" })`, Create, Refresh.
- When `mode === "browse"`: render `InsightsPanel` then the existing table (create modal, bulk delete, floating bar unchanged).
- When `mode === "values"`: render `ValueSearchPanel` instead of the table. Do not unmount insights if you want them visible — spec says results replace the **table**; insights may stay. Keep insights visible above the mode switch.
- Title: `Secrets Manager` (`text-2xl`), not `Secrets` + leftover insights links.
- Shift+R still calls `refreshSecrets`.

Compute insights from `secrets` the same way as old overview: `rotationEnabled` count, `daysSince` > 180 for stale.

- [ ] **Step 8: Typecheck and unit tests**

Run:

```bash
npx vitest run lib/secrets/page-url.test.ts lib/dashboard/exceptions.test.ts
npx tsc --noEmit
```

Expected: PASS / exit 0.

- [ ] **Step 9: Commit**

```bash
git add lib/secrets/page-url.ts lib/secrets/page-url.test.ts \
  components/secrets/insights-panel.tsx \
  components/secrets/value-search-panel.tsx \
  app/secrets/page.tsx
git commit -m "feat: combine AWS secrets browse, insights, and value search"
```

---

### Task 6: Combined Amplify page

**Files:**
- Create: `lib/amplify/page-url.ts`
- Test: `lib/amplify/page-url.test.ts`
- Create: `components/amplify/env-search-panel.tsx`
- Modify: `app/amplify/page.tsx`

**Interfaces:**
- Consumes: existing `fetchAllApps` in `app/amplify/page.tsx`; `POST /api/amplify/search`
- Produces: `amplifyHref`, `parseAmplifyMode`

- [ ] **Step 1: Write URL helper tests**

Create `lib/amplify/page-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { amplifyHref, parseAmplifyMode } from "./page-url";

describe("amplifyHref", () => {
  it("browse has no query", () => {
    expect(amplifyHref()).toBe("/amplify");
  });

  it("search mode forwards q", () => {
    expect(amplifyHref({ mode: "search" })).toBe("/amplify?mode=search");
    expect(amplifyHref({ mode: "search", q: "KEY" })).toBe("/amplify?mode=search&q=KEY");
  });
});

describe("parseAmplifyMode", () => {
  it("defaults to browse", () => {
    expect(parseAmplifyMode(null)).toBe("browse");
    expect(parseAmplifyMode("search")).toBe("search");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/amplify/page-url.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/amplify/page-url.ts`**

```ts
export type AmplifyPageMode = "browse" | "search";

export function parseAmplifyMode(raw: string | null): AmplifyPageMode {
  return raw === "search" ? "search" : "browse";
}

export function amplifyHref(opts: { mode?: AmplifyPageMode; q?: string } = {}): string {
  const params = new URLSearchParams();
  if (opts.mode === "search") {
    params.set("mode", "search");
    if (opts.q) params.set("q", opts.q);
  }
  const qs = params.toString();
  return qs ? `/amplify?${qs}` : "/amplify";
}
```

- [ ] **Step 4: Run URL tests**

Run: `npx vitest run lib/amplify/page-url.test.ts`

Expected: PASS.

- [ ] **Step 5: Env search panel**

Move highlight + search form + results from old `app/amplify/search/page.tsx` into `components/amplify/env-search-panel.tsx`.

- No page `h1`.
- Do not fetch until submit. Non-empty URL `q` from redirect: prefill; fetch on mount only if `q` is non-empty.
- Error: “Couldn’t search env vars. Retry.”
- Keep jump links to `/amplify/[appId]`.

- [ ] **Step 6: Compose `app/amplify/page.tsx`**

- `Suspense` + `useSearchParams`.
- Title `Amplify` with `text-2xl font-medium`.
- Equal compact tile: app count only (`apps.length`). Do not add a second KPI request.
- Sticky bar: app-name filter (browse mode only), “Env search” → `amplifyHref({ mode: "search" })`, Refresh.
- Browse mode: existing table + client name filter. Do not point that input at `/api/amplify/search`.
- Search mode: `EnvSearchPanel` replaces the table.
- “Browse apps” control returns to `amplifyHref()`.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add lib/amplify/page-url.ts lib/amplify/page-url.test.ts \
  components/amplify/env-search-panel.tsx app/amplify/page.tsx
git commit -m "feat: combine Amplify app list and env search on one route"
```

---

### Task 7: Docs, graphify, full validation

**Files:**
- Modify: `CODEBASE.md` (Dashboard, Secrets UI, Amplify UI, Directory Structure notes)
- No new product code

**Interfaces:**
- Consumes: shipped routes from Tasks 2–6
- Produces: accurate CODEBASE map

- [ ] **Step 1: Update `CODEBASE.md`**

Replace the Dashboard section with:

```md
## Dashboard

- `/` is **Needs attention**: hero = exception row total; supporting GitHub failed/live, secrets hygiene (union), Fly unhealthy (`degraded`/`down`). One exception list (cap 15). No tool directory.
- Builders: [`lib/dashboard/exceptions.ts`](lib/dashboard/exceptions.ts). Redirects: [`lib/dashboard/legacy-redirect.ts`](lib/dashboard/legacy-redirect.ts).
- `/aws` → `/`. `/github/overview` → `/github`. AWS sidebar header is expand-only.
- Composition methodology: [`.cursor/skills/dashboard-design/`](.cursor/skills/dashboard-design/).
```

Update Secrets UI:

```md
- `/secrets` is browse + insights tiles/triage + `?mode=values` value search. `/secrets/overview` and `/secrets/search` redirect.
- `/secrets/[id]` detail unchanged.
```

Update Amplify UI: env search is `/amplify?mode=search`; `/amplify/search` redirects.

In Directory Structure, note `lib/dashboard/` and that home is no longer a directory.

- [ ] **Step 2: Full validation**

Run:

```bash
npx vitest run
npx tsc --noEmit
npm run lint
graphify auto-update .
```

Expected: tests pass; `tsc` exit 0; lint acceptable (no new errors); graphify succeeds.

Manual checklist (do in the browser on `npm run dev` port 3325):

1. `/` shows Needs attention, not platform cards.
2. AWS header click expands/collapses and does **not** navigate.
3. `/aws` ends on `/`.
4. `/github/overview` ends on `/github`.
5. `/secrets/overview` ends on `/secrets`.
6. `/secrets/search?q=foo` ends on `/secrets?mode=values&q=foo` and does not values-fetch until appropriate (`q` present may fetch once).
7. `/amplify/search` ends on `/amplify?mode=search`.
8. Secrets chips and insights tiles change `filter` in the URL.
9. Home `?source=github` filters the list.
10. Disconnect Fly (or stop flyctl auth) — home still shows GitHub/secrets; Fly tile errors with Settings link.
11. All-clear: “Nothing needs attention.”

- [ ] **Step 3: Commit**

```bash
git add CODEBASE.md
git commit -m "docs: map dashboard v2 needs-attention IA in CODEBASE"
```

If graphify wrote `graphify-out/` and that directory is gitignored, do not force-add it.

---

## Self-review (spec coverage)

| Spec requirement | Task |
|---|---|
| Home Needs attention, hero, 3 tiles, one list, no directory | 4 |
| Exception rules, cap 15, unrotated aggregate, stale cap 8 | 1 |
| Per-source errors, Fly 401 copy, no fake healthy 0 | 4 |
| GitHub one-shot on `/`, no new APIs | 4 |
| Secrets stacked, no hero, value-search mode | 5 |
| Amplify merge, no invented triage, env search mode | 6 |
| Redirects + query forward | 2 |
| AWS expand-only, GitHub hub `/github`, drop children | 3 |
| Tokens / a11y | 4–6 constraints |
| CODEBASE + graphify + tsc/lint | 7 |
| Out of scope (Analyzer, unified secrets, GH runs merge) | not tasked |

No TBD/TODO placeholders. Signatures in later tasks match Task 1 (`ExceptionRow`, `mergeExceptions(rows, omittedStale)`, `filterRowsBySource`).
