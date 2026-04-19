---
name: elegant
description: Flightdeck (aws-manager) design tokens, components, GitHub Actions UI patterns, sticky filters, polling/mutation UX, and client/server safe imports — grounded in app/globals.css and the GitHub Actions module plan.
license: MIT
metadata:
  author: typeui.sh
---

<!-- TYPEUI_SH_MANAGED_START -->
# Elegant Design System Skill — Flightdeck

## Mission
You are an expert design-system guideline author for Flightdeck (the aws-manager Next.js app).
Create practical, implementation-ready guidance grounded in the project's actual tokens, fonts, and established patterns.

## Brand — Flightdeck
Single-pane ops console covering AWS and GitHub. Apple-inspired: calm when healthy, urgent only when something needs attention. Sophisticated, not flashy. Information-dense without feeling crowded.

## Actual Token System (globals.css + Tailwind v4)

### CSS custom properties on `:root`
| Token | Value | Use |
|-------|-------|-----|
| `--bg-deep` | `#fafafa` | Page / main background |
| `--bg-elevated` | `#ffffff` | Sidebar, panels, cards |
| `--bg-field` | `#ffffff` | Form fields, tables, data panels |
| `--bg-surface` | `#ffffff` | Hover state for cards |
| `--bg-muted` | `#ececea` | Skeleton pulse, muted backgrounds |
| `--bg-hover` | `#f3f4f6` | Hover states on interactive rows |
| `--border` | `#e2e2de` | Standard borders |
| `--border-subtle` | `#eaeae8` | Lighter borders |
| `--border-hairline` | `#e8e8e5` | Thinnest borders (card outlines, dividers) |
| `--text-primary` | `#1c1917` | Primary text |
| `--text-secondary` | `#57534e` | Secondary labels |
| `--text-muted` | `#78716c` | Muted metadata |
| `--text-faint` | `#a8a29e` | Faintest captions |
| `--accent` | `#4f46e5` | Indigo — primary interactive, active nav |
| `--accent-dim` | `rgba(79,70,229,0.1)` | Light accent fill (badges, count chips) |
| `--accent-muted` | `rgba(79,70,229,0.09)` | Active nav background |
| `--success` | `#15803d` | Green — success status |
| `--warn` | `#c2410c` | Orange — warning, queued state |
| `--danger` | `#b91c1c` | Red — error, failed state |

### Tailwind v4 usage
Always reference tokens via `bg-(--token)`, `text-(--token)`, `border-(--token)`. Never hardcode hex values. Tailwind v4 shorthand: `font-mono` instead of `font-(family-name:--font-mono)` is equivalent — the codebase uses the long form intentionally; match whatever the file already uses.

## Actual Fonts (next/font/google)
| Variable | Font | Use |
|----------|------|-----|
| `--font-display` / `font-(family-name:--font-display)` | **Fraunces** | Page headings, dashboard titles |
| `--font-sans` / default body | **DM Sans** | Body text, labels, buttons |
| `--font-mono` / `font-(family-name:--font-mono)` | **IBM Plex Mono** | Numbers (tabular-nums), SHAs, durations, mono values |

**Rule:** Numeric metric values must always use `font-(family-name:--font-mono) tabular-nums`. Page h1s use `font-(family-name:--font-display)`. All other copy is DM Sans (default).

## Spacing Scale
Use Tailwind's standard scale anchored at 4px. Established cadence: `gap-2` (8px) inside cards, `gap-4` (16px) between cards, `px-5 py-4` for stat cards, `px-3 py-2.5` for compact list rows, `px-8 py-8` for main content area.

## Established Component Patterns

### Stat Card
```
rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm
  — metric: font-(family-name:--font-mono) text-3xl font-light tabular-nums
  — label: text-xs font-medium text-(--text-secondary)
  — sub: text-[11px] text-(--text-faint)
```

### Feature / Link Card (IAM-style)
```
rounded-xl border border-(--border) bg-(--bg-field) p-5
  hover: border-(--accent)/40 bg-(--bg-surface)
  — use `group` + `group-hover:text-(--accent)` on title
```

### Data List Row
```
flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors
  default: hover:bg-(--bg-hover)
  focused: bg-(--accent-muted)
```

### Run Card (GitHub Actions)
```
rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-4
  focused: border-(--accent)/50 ring-2 ring-(--accent)/20 shadow-md
  hover: border-(--border) shadow-sm
```

### Action Button Variants
| Variant | Class pattern |
|---------|---------------|
| Primary | `bg-(--accent) text-white hover:opacity-90` |
| Default | `border border-(--border) bg-(--bg-surface) text-(--text-secondary) hover:border-(--accent)/50 hover:text-(--accent)` |
| Danger | `border border-(--danger)/20 bg-(--danger)/5 text-(--danger) hover:bg-(--danger)/10` |
| Ghost | `border-transparent text-(--text-muted) hover:bg-(--bg-hover)` |

### Skeleton Loading
```
animate-pulse rounded bg-(--bg-muted)
```
Skeletons must appear instantly (< 50ms perceived) — render them unconditionally during initial load rather than showing nothing.

### Status Indicators (GitHub Actions)
| State | Color token | Visual |
|-------|-------------|--------|
| in_progress | `--accent` | Spinning SVG circle |
| queued / waiting | `--warn` | Clock SVG |
| success | `--success` | Filled circle + check |
| failure / timed_out | `--danger` | Circle + X |
| cancelled | `--text-muted` | Circle + dash |
| skipped | `--text-faint` | Dashed circle + arrow |

### Pulsing Activity Dot
```html
<span class="relative flex h-2 w-2">
  <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--accent) opacity-60" />
  <span class="relative inline-flex h-2 w-2 rounded-full bg-(--accent)" />
</span>
```
Use to signal live activity (in-progress runs in sidebar, active run count). Never use for static state.

### Health / Progress Bar
```
h-1.5 overflow-hidden rounded-full bg-(--bg-muted)
  inner: h-full rounded-full transition-all duration-500
  — green ≥90%: var(--success) | amber 70–89%: var(--warn) | red <70%: var(--danger)
```

### Empty State
Center-aligned, 40px SVG icon in `text-(--text-faint)`, `text-sm font-medium text-(--text-secondary)` title, `text-xs text-(--text-muted)` description. No borders or cards around empty states — let them breathe.

### Keyboard Hint Strip
```
rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-3
  <kbd>: rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]
```

## UX Principles (from Flightdeck plan)

1. **Instant perceived speed** — Skeleton cards appear in < 50ms; never show a blank screen. Data fills in behind the skeleton.
2. **Quiet when calm** — When all runs are green, the dashboard is minimal and serene. Urgency (color, animation, badges) appears only when something needs attention.
3. **Keyboard-first** — Every interaction reachable without mouse. All buttons have `:focus-visible` ring using `--accent`. Arrow-key grid navigation for card grids.
4. **Progressive disclosure** — Dashboard shows summary → card grid shows everything → card expand shows detail. Never dump all information at once.
5. **Optimistic mutations** — Status updates immediately on action; revert on error. Never make the user wait for a spinner before seeing feedback.
6. **Smart defaults** — Show what matters first: in-progress > failures > settled. No configuration required to land on a useful view.

## Smart Polling Pattern (GitHub data)
| Condition | Interval |
|-----------|----------|
| Any run in_progress or queued | 8s |
| Recent failure (last 2 min) | 15s |
| All settled | 60s |
| Tab not focused | Pause (resume on visibilitychange) |
| After mutation | Immediate + 5s follow-up |

Preload GitHub data at app shell level so the `/github` routes feel instant; show skeletons until the first response — never block on unbounded API fan-out (server should cap repos / runs and time-budget the route).

## Sticky Filter Bar (dense data views)
For long scrollable grids (e.g. All runs), keep controls reachable without scrolling away:
```
sticky top-0 z-10 -mx-8 bg-(--bg-deep)/90 px-8 py-3 backdrop-blur-sm border-b border-(--border-hairline)
```
Pair with URL-synced filters (`useSearchParams`) so views are **shareable and bookmarkable** — encode status, repo, workflow, branch, sort in the query string.

## Event Badge (GitHub workflow trigger)
Small mono chip for trigger type (`push`, `PR`, `cron`, `manual`):
```
inline-flex rounded-full border border-(--border-subtle) bg-(--bg-muted) px-1.5 py-0.5 font-(family-name:--font-mono) text-[10px] text-(--text-muted)
```

## Active Run Row — Indeterminate Progress
Use a sliding inner bar on `bg-(--bg-muted)` track to suggest work in flight (not a determinate %). Pair with live elapsed time (`ElapsedTimer`), not static text.

## Sidebar Nav — Activity Without Noise
When a module has **live** background work (e.g. Actions in progress), show the **pulsing activity dot** next to that nav item only. Hide when idle. Do not use animation for static counts.

## Mutation UX
- **Optimistic**: Update run status in UI immediately on re-run / cancel; revert if the API errors.
- **Destructive**: Use shared `ConfirmDialog` for cancel and similar irreversible actions; loading state on confirm button.

## Server / Client Bundle Boundary (design implication)
Pure helpers (`computeSummary`, DTO types) live in `lib/github/types.ts`. Never import `lib/github/client.ts` or `lib/aws/*` from `"use client"` components — those pull Node-only modules into the browser bundle and break `next dev`. UI talks to GitHub/AWS only via `/api/*` routes.

## Section Labels (Sidebar)
```
text-[10px] font-semibold uppercase tracking-[0.12em] text-(--text-faint)
```

## Typography Scale in Practice
| Element | Size | Weight | Font |
|---------|------|--------|------|
| Page h1 | `text-2xl` | `font-medium` | display |
| Section h2 | `text-sm` | `font-semibold` | sans |
| Card title | `text-[13px]` | `font-medium` | sans |
| Body / label | `text-sm` | regular | sans |
| Secondary | `text-xs` | regular | sans |
| Caption / meta | `text-[11px]` | regular | sans |
| Faintest | `text-[10px]` | regular | sans or mono |
| Numeric metric | `text-3xl` | `font-light` | mono |
| Compact numeric | `text-xs` | regular | mono + tabular-nums |

## Accessibility
WCAG 2.2 AA. Visible `:focus-visible` rings (`ring-2 ring-(--accent)/20`) on all interactive elements. Never rely on color alone for status — always pair with icon or label. All SVG status icons have `aria-label`.

## Anti-Patterns
- **No hardcoded hex values** — always use `--token`
- **No color without meaning** — pulsing/danger/warn only for actual live/bad state
- **No empty states as errors** — "All clear" with a check icon is a positive state, not a failure
- **No loading spinners for the initial skeleton** — use `animate-pulse` skeleton shapes instead
- **No status color without accessible label** — `aria-label` on status SVGs is required

<!-- TYPEUI_SH_MANAGED_END -->

