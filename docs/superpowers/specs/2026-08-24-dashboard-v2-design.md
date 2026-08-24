# Dashboard v2 — Needs attention + combined service views

Date: 2026-08-24  
Status: approved in design conversation; implementation starts only after this spec is reviewed.

## Problem

`/` is titled an operations dashboard but is a tool directory (platform spotlights + “All tools”). AWS Secrets Manager is split across browse (`/secrets`), insights (`/secrets/overview`), and value search (`/secrets/search`). Amplify repeats the split (`/amplify` vs `/amplify/search`). `/aws` and `/github/overview` duplicate the sidebar.

The operator’s job is: **see what needs action, open the record.** Extra pages add clicks, not decisions.

## Role, decision, cadence

| Field | Value |
|---|---|
| **Who** | Single local-first operator (on-call / shipping). One primary role. |
| **Home decision** | Which item do I open first? |
| **Secrets decision** | Which secret do I open or fix? |
| **Amplify decision** | Which app/branch env am I opening or searching? |
| **Cadence** | Operational. No analytical chart wall on `/`. |
| **Aha** | On first load of `/`, the top exception is already sorted by urgency. |
| **Success** | Time from load to opening a real record; task success on filter / value-search mode / redirects; unused widgets get cut later. |

Utility first. This is not a reskin. Tokens stay on the Flightdeck design system (`globals.css`, `design-system.mdc`). No decorative blurs, gradient tool cards, `text-3xl` page titles, or `rounded-2xl` marketing headers.

## Out of scope

- Unified cross-service secrets cockpit (AWS + GitHub + Fly on one page).
- Access Analyzer, IAM, and Route 53 / Fly certs on the home exception list.
- Merging GitHub Actions, All runs, and Workflows (different cadences).
- Changing GitHub secrets hub or Fly secrets page (already one view each).
- New list/fan-out APIs.
- Rearrangeable widgets or saved home layouts.
- Dark mode work.

## Information architecture

### Keep as real pages

- `/` — Needs attention (home).
- `/secrets` — Combined AWS Secrets Manager.
- `/secrets/[id]` — Secret detail (unchanged job).
- `/amplify` — Combined Amplify list + env search.
- `/amplify/[appId]` — App detail (unchanged).
- `/github`, `/github/runs`, `/github/workflows`, `/github/secrets`.
- `/fly/overview`, `/fly/secrets`.
- IAM, Analyzer, Route 53, Settings, design system — unchanged jobs.

### Remove as destinations (redirect)

| From | To |
|---|---|
| `/aws` | `/` |
| `/github/overview` | `/github` |
| `/secrets/overview` | `/secrets` |
| `/secrets/search` | `/secrets?mode=values` (preserve `q` if present) |
| `/amplify/search` | `/amplify?mode=search` (preserve `q` if present) |

Redirects are permanent for bookmarks and sidebar history. Implement with Next.js `redirect()` on the old routes (or equivalent) so query strings can be forwarded.

### Sidebar (`lib/modules/registry.ts`)

- Dashboard → `/` unchanged.
- **AWS header:** expand/collapse only. It is not a link. No hub href. Clicking the AWS row toggles the section; it does not navigate.
- **GitHub header:** `href` changes from `/github/overview` to `/github`.
- **Secrets Manager:** one item (`/secrets`). Remove children “Value search” and “Insights”.
- **Amplify:** one item (`/amplify`). Remove child “Env search”.
- Fly, IAM, Analyzer, Route 53, GitHub children (Actions, All runs, Workflows, Secrets), Settings: unchanged.

Update `overview-directory.ts` so it no longer feeds home, `/aws`, or GitHub overview. Keep only what remaining pages need (Fly overview link helper). Delete `PlatformSpotlights` and `ServiceDirectory` usage from `/`.

### Shell / chrome

- `derivePageContext` / breadcrumbs: drop `awsOverview` and `githubOverview` as live pages. Map leftover `/secrets/search` and `/secrets/overview` only if a request hits them before redirect (redirect should win).
- `showAwsWorkspaceSelectors`: remove the `/aws` branch (page gone). **Do not** show AWS region/profile selectors on `/`. Home is cross-platform; the context strip shows current AWS profile/region, GitHub CLI, and Fly as labels from existing providers. Operator changes AWS workspace on an AWS tool page or Settings.
- Sidebar active-state helpers: remove special cases for `/aws`, `/secrets/search`, `/secrets/overview`, `/amplify/search`, `/github/overview`. AWS section auto-expand still uses the remaining AWS tool prefixes (not `/`).

## Home `/` — Needs attention

Named decision (page title/subtitle): **Needs attention**.

```
CONTEXT     Needs attention · AWS profile/region · GitHub CLI · Fly CLI · last updated
DECISION    [ HERO: N need action ]  [GitHub failing/live]  [Secrets hygiene]  [Fly unhealthy]
EXCEPTIONS  one list, urgency first — platform · what’s wrong · age · Open
WORK        the list is the work (no second table, no tool directory)
```

### Decision strip

- **Hero (home only):** count of rows currently in the exceptions list (after the cap, or total before cap — **use total matching exceptions, not the visible cap**, so “12 need action” can exceed the 15 shown). Hero is optically heavier (span 2 or larger type).
- **GitHub tile:** failed in last 24h (primary number). Sub: in-progress/queued count if > 0. Click filters the list to GitHub.
- **Secrets hygiene tile:** count of secrets that are unrotated **or** last accessed > 180 days (union, not sum). Sub: “unrotated / stale” breakdown. Click filters the list to Secrets.
- **Fly tile:** count of apps with `health` `degraded` or `down`. Sub: those names or “N apps”. Click filters the list to Fly. `unknown` is **not** an exception.

Tiles are not dead ends: they only filter the list on this page (URL `?source=github|secrets|fly`). “View all” on overflow goes to `/github`, `/secrets` (with the matching chip), or `/fly/overview`.

### Exception list

Single list, sort: severity (danger → warn → info), then recency (newer first). Cap **15** visible rows. Overflow line: “N more on {service}” linking to that service.

| Severity | Source | Row |
|---|---|---|
| Danger | GitHub run `conclusion` failed / timed_out in last 24h | `{repo} / {workflow} failed · {age} · Open` → `/github` (no new per-run route) |
| Danger | Fly app `degraded` or `down` | `{app} {health} · Open` → `/fly/overview` |
| Warn | GitHub run `in_progress` or `queued` | `{repo} / {workflow} live · {elapsed} · Open` → `/github` |
| Warn | Secrets without auto-rotation | If count ≤ 5: one row per secret → `/secrets/{id}`. If count > 5: one aggregate row “N secrets without auto-rotation · Review” → `/secrets` with `no-rotation` filter |
| Info | Secret last accessed > 180d | `{name} not accessed in {d} days · View` → `/secrets/{id}` |

Do not emit one row per unrotated secret when that would drown Fly/GitHub. Aggregate unrotated when count > 5. Stale secrets: up to 8 individual rows (same as today’s overview), then overflow to `/secrets` with `stale` filter.

Zero rows: one quiet line — “Nothing needs attention.” No illustration.

### Cut from `/`

Platform spotlight cards, “All tools” / `ServiceDirectory`, decorative blurs, `rounded-2xl` hero, `text-3xl` title.

### Data on home

No new list APIs. Compose three existing sources independently:

| Slice | Source | Already available |
|---|---|---|
| Secrets | `DataProvider` (`useData`) | Yes — metadata list |
| GitHub | `GithubDataProvider` (`useGithubData`) | Yes — shell preload |
| Fly | `GET /api/fly/apps?status=1` | Yes — same as Fly overview |

Render each slice as it arrives. One source error does not blank the others: that tile and those rows show an error + Retry; other slices stay. Last-updated is **per source** on the tile (absolute + relative). If a source is stale, show the data plus a warn — do not present it as live.

Loading: skeleton in the final geometry (hero + three tiles + ~5 list rows). No centered spinner that collapses layout.

Home does not `loadSecrets()` in a new way if DataProvider already loads on workspace change; it may call `loadSecrets()` on mount if the list is still cold (same as today’s overview).

## AWS Secrets `/secrets`

No hero tile (explicit). Equal compact tiles only.

```
CONTEXT     Secrets Manager · profile/region · updated · [Create] [Refresh]
DECISION    [Total]  [Rotation %]  [Stale]
EXCEPTIONS  triage (unrotated aggregate, stale names) — click applies a table filter
WORK        existing browse table (env / no-rotation / stale + create + bulk)
            value search = filter-bar mode, not a page
```

- **Total / Rotation % / Stale:** same definitions as today’s `/secrets/overview`. Clicking a tile sets the existing browse filter (`all` / `no-rotation` / `stale`).
- **Triage:** same items as today’s overview, but navigation is **in-page filter** (or `/secrets/{id}` for a named stale secret). Do not route to `/secrets/overview`.
- **Default work:** today’s metadata table, filters, create modal, bulk delete, floating action bar.
- **Value search mode:** sticky filter bar control. URL `/secrets?mode=values&q=`. Calls `POST /api/secrets/values` only after the operator submits a query. Results replace the table; today’s bulk-edit-from-search stays. Default mode is metadata browse (no values fetch).
- **Keep:** `/secrets/[id]`, Shift+R refresh, `j`/`k` on the triage list only (not the full table unless already implemented on browse).
- **Nav:** single “Secrets Manager” item.

Existing browse chips and value-search mode are mutually exclusive in the URL: `mode=values` hides env chips; leaving the mode restores the last metadata filter (or `all`).

## Amplify `/amplify`

No hero. No invented triage (Amplify has no rotation/stale signal).

```
CONTEXT     Amplify · profile/region · updated
DECISION    compact equal tiles: app count (and branch count only if already on the list payload — do not add requests to invent a second KPI)
WORK        today’s app list (name filter stays in default mode)
            env search = filter-bar mode (`/amplify?mode=search&q=`)
```

- Default: today’s `GET /api/amplify/apps` list.
- `mode=search`: today’s `POST /api/amplify/search` UI (highlight + jump to app). Do not run env search until the operator submits a query.
- `/amplify/[appId]` unchanged.
- Sidebar: one Amplify item.

App-name filter (client filter on the list) and env search are different modes. Do not merge them into one search box that secretly hits values.

## GitHub and Fly (no page merge)

- GitHub overview page goes away; header lands on Actions (`/github`).
- GitHub secrets, Fly secrets, Fly overview: no structural merge.
- Home only **reads** their existing data for exceptions.

## Components and data flow

Keep client/server boundaries: no `lib/aws/*`, `lib/fly/cli.ts`, or `lib/github/client.ts` in client components.

Suggested units (names can shift; jobs cannot):

| Unit | Job | Depends on |
|---|---|---|
| Pure exception builders (`lib/dashboard/exceptions.ts` or similar) | Map secrets / runs / Fly apps → `ExceptionRow[]` | Client-safe types only |
| Home dashboard components | Context, KPI strip, exception list | Providers + Fly fetch + builders |
| Secrets insights widgets | Equal tiles + triage | `useData` |
| `/secrets` page | Compose insights + browse + value-search mode | Existing secrets components + `useSearchParams` |
| `/amplify` page | Compose list + env-search mode | Existing Amplify fetch + search UI |
| Redirect pages | `redirect()` with query forward | Next.js |
| Registry + overview-directory + sidebar + shell | IA | This spec’s hrefs |

`ExceptionRow` (normative):

- `id: string`
- `severity: "danger" | "warn" | "info"`
- `source: "github" | "secrets" | "fly"`
- `label: string` — operator language, not schema names
- `ageLabel: string | null`
- `href: string`
- `actionLabel: string` — e.g. Open, Review, View

### Error handling

- Home: per-source error + Retry; other sources remain.
- Secrets/Amplify: existing page-level error + retry; mode-specific search errors stay in the results frame (“Couldn’t search values. Retry.”) without clearing the metadata list if the operator switches back.
- Never show raw gateway codes. Say what failed and what to do.
- Fly 401 (not logged in): treat as that slice’s error — “Fly CLI is not authenticated” + link to Settings — not a full-page failure.

### Permissions / missing CLI

Hide nothing behind fake locked chrome. If GitHub or Fly data is unavailable, omit those rows and show the slice error. Do not show a GitHub failure count of 0 that looks healthy when the provider never loaded.

## Visual / a11y

- Page `h1`: `text-2xl font-medium font-(family-name:--font-display)`.
- Cards: `rounded-xl shadow-sm`. Buttons: `rounded-lg`.
- Primary actions: `bg-(--accent) text-white hover:opacity-90`.
- Status color only for severity/state. Hero number uses default text color unless the count is > 0 and includes danger rows — then danger on the number is allowed **with** a text label (not color alone).
- Focus: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20`.
- Filters sticky when the secrets/Amplify table scrolls (`sticky` + `bg-(--bg-deep)/90` pattern).
- Contrast: existing tokens only. No Fly purple / AWS hex except existing sidebar vendor marks.

## Testing and evaluation

Required before done:

- `npx tsc --noEmit`
- `npm run lint`
- Existing `npm run test` (and GitHub secrets perf tests if touched)
- Manual: each redirect; `/secrets` chips; `/secrets?mode=values&q=`; `/amplify?mode=search&q=`; home with one source failing; home empty (all clear); AWS header does not navigate

Eval (after ship, not a gate): time to first exception click; whether `/secrets/overview` bookmarks still land correctly; whether home directory traffic dies (it should).

## Implementation notes

- Update `CODEBASE.md` Dashboard / Secrets / nav sections when this ships.
- Update graphify after source edits.
- Nav + overviews rule: registry and `overview-directory.ts` stay the single link sources.
- Prefer extracting today’s overview/search UI over rewriting it.

## Explicit non-goals recap

Do not add Analyzer or certs to `/`. Do not put a secrets hero back. Do not keep `/aws` or `/github/overview` as card directories. Do not load secret **values** or Amplify env search on first paint.
