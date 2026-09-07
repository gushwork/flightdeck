# Dashboard patterns

Concrete composition recipes. Tokens and radius come from the project design system. These patterns are structure only.

## Page skeleton

```
┌─────────────────────────────────────────────────────────────┐
│ CONTEXT   Title · subtitle (the decision) · range · updated │
│           [primary filters]                    [saved view] │
├─────────────────────────────────────────────────────────────┤
│ DECISION  [ HERO KPI ]  [kpi]  [kpi]  [kpi]                 │
├─────────────────────────────────────────────────────────────┤
│ EXCEPTIONS  alert list / “needs attention” (omit if empty)  │
├──────────────────────────────┬──────────────────────────────┤
│ EVIDENCE  1–2 charts         │ WORK  queue / table / pipe   │
└──────────────────────────────┴──────────────────────────────┘
```

- Desktop: evidence ~60% / work ~40%, or stacked if the work list *is* the product.
- Tablet: single column — context → hero → exceptions → work → evidence.
- Mobile: hero + exceptions + work. Charts behind a “Trends” disclosure.

F-pattern: hero and filters on the first line of sight. Z-pattern: hero top-left, primary CTA top-right, work along the base.

Bento is allowed when KPIs are mixed types (count, money, health). Keep module sizes unequal — one tile must be visually primary. Equal tiles = no hierarchy.

## Context chrome

Always include:

- **Page title** that names the job (“Accounts at risk”, not “Dashboard”).
- **Scope** — account, environment, team, region.
- **Time range** — default matches cadence (ops: today/24h; strategic: quarter).
- **Last updated** — absolute time + relative. If stale, warn.
- **Filters** — few, high-leverage, sticky on scroll. Advanced behind “More filters.”
- **Saved view** — if the same person has recurring jobs.

Do not put secondary nav, marketing banners, or changelog toasts in this strip.

## Metric tile

One tile, one number, one comparison.

```
Label (user language)
Value (largest type on the tile)
Delta vs target / prior period / peer  + spark only if it earns space
Optional: unit, sample size, “as of”
```

Rules:

- Hero tile is larger (span 2) or optically heavier. Others stay compact.
- Delta needs a baseline. “+12%” without “vs last week / vs target” is incomplete.
- Status color on the delta or a 4–6px leading bar — not a rainbow fill.
- Clicking the tile drills to evidence or the work list, never a dead end.
- Cap the strip at four tiles. A fifth metric is a failed prioritization.

## Exception / alert row

Operational dashboards live or die here.

- Sort by urgency, not recency, unless recency *is* urgency.
- Each row: entity, what’s wrong, since when, next action.
- Batch actions only when the same action applies.
- If zero exceptions: one quiet line (“No accounts need attention”) — do not invent a celebration illustration that competes with the hero.

Ravel pattern: notifications exist so customer-success can see **who is at risk** without hunting tables.

## Evidence (charts)

Pick the encoding from the question:

| Question | Chart |
|----------|--------|
| How did this change over time? | Line or area (one series); multi-series only if ≤4 and legend is adjacent |
| How do categories compare? | Horizontal bar (long labels) or vertical bar (few categories) |
| Where is the funnel leaking? | Horizontal stepped bars or a simple conversion list — not a 3D funnel |
| What is the mix? | Prefer a table or stacked bar. Pie only for 2–3 slices with a total nearby |
| What needs a scan of many rows? | Table, not a chart |

Never:

- 3D, exploded pies, dual-axis unless both scales are explained
- Texture fills, gradient fills, decorative area under a noisy series
- More than one insight claim in the chart title

Every chart has: title (the question), axis units, legend if multi-series, source + range in a caption, and an empty/error state in the same frame.

## Work list (the action surface)

Dashboards that cannot open a record are reports. Prefer:

- Table with 4–7 columns: identity, the metric that justified the row, status, owner, updated, action.
- Default sort = the decision (risk desc, SLA remaining, amount).
- Row click opens the object. Separate icon-only actions need labels or tooltips.
- Bulk actions in a sticky bar after selection.
- Pagination or virtualize; do not dump 10k rows into the first paint.

Ravel pattern: **customizable columns + robust filters + dynamic lists** — after a strong default.

## Pipeline / Kanban

Sales and ops boards:

- Columns are stages in the user’s language.
- Each card: name, the one metric that matters (amount, SLA, score), owner.
- WIP limits or counts per column if the decision is “where are we stuck.”
- Do not put a second full dashboard of charts above a kanban unless the user asked for both cadences.

## Filters and progressive disclosure

1. Time + 1–2 facet filters visible.
2. Search for known entities.
3. Everything else in a sheet or “More.”
4. Active filters as dismissible chips.
5. “Clear all” when ≥2 chips.
6. URL-serialize filters so views are shareable / saveable.

## States (design all four)

| State | Treatment |
|-------|-----------|
| **Loading** | Skeleton in the widget’s final geometry. Do not collapse the page. |
| **Empty (first run)** | Sandbox/sample data *or* a single import CTA that states the aha. Empty is not friendly. |
| **Empty (filtered)** | “No rows for these filters” + clear filters. |
| **Error** | What failed, what is still trustworthy, retry. |
| **Forbidden** | Hide the widget. Do not tease locked metrics. |
| **Stale** | Show data + a warn that it is old; do not silently present it as live. |

## Customization controls

Place behind an “Edit layout” affordance — not as always-on drag handles.

- Reorder modules
- Hide optional modules (never hide safety-critical ones for that role)
- Save as “My view” / team view
- Reset to role default

## Microinteractions (allowed)

- Filter apply: subtle progress in the evidence/work frames
- Tab / range change: cross-fade content, keep chrome still
- Adding a widget: brief confirm, no bounce festival
- Hover: row highlight via surface token, not a glow

## Responsive collapse

1. Context (title + range) stays.
2. Hero KPI stays.
3. Exceptions stay (they *are* mobile ops).
4. Work list full width.
5. Extra KPIs → horizontal snap scroll or a 2×2 after the hero.
6. Charts → accordion.

Touch targets ≥ 44px on primary actions. Do not shrink table actions to icon specks.

## Copy patterns

| Element | Pattern |
|---------|---------|
| Title | Decision or object: “Needs attention” |
| Subtitle | Scope + cadence: “Open incidents · last 24 hours” |
| KPI label | Noun users say: “Failed deploys”, not `deploy_failure_count` |
| Delta | “12% vs last week” / “3 above target” |
| Empty | “Connect your CRM to see accounts at risk” + one button |
| Error | “Couldn’t load pipeline. Last successful refresh 14:02.” + Retry |

## Pairing with a tokenized app (e.g. Flightdeck)

When implementing here:

- Surfaces: page `bg-deep`, chrome `bg-elevated`, fields/tables `bg-field`
- Cards `rounded-xl shadow-sm`; buttons `rounded-lg`
- Status via `--success` / `--warn` / `--danger` muted fills — never as the primary CTA
- Primary action `bg-(--accent) text-white hover:opacity-90`
- Page `h1`: `text-2xl font-medium` + display font
- Focus: `focus-visible:ring-2 focus-visible:ring-(--accent)/20`

See the project `design-system` skill / `.cursor/rules/design-system.mdc` for the full token list.
