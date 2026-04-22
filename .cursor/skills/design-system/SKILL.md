---
name: design-system
description: Flightdeck UI tokens, components, GitHub Actions patterns, and client/server-safe styling — authoritative content lives in the workspace rule.
license: MIT
metadata:
  author: typeui.sh
---

# Flightdeck design system

**Authoritative rule (implementers):** [`.cursor/rules/design-system.mdc`](../../.cursor/rules/design-system.mdc)

**In-app summary (operators):** [`/design-system`](../../app/design-system/page.tsx)

The rule covers tokens (`globals.css`), Tailwind v4 usage, fonts, spacing, component patterns (stat cards, run cards, buttons, skeletons), GitHub Actions UI, polling, sticky filters, **sidebar navigation** (registry, collapsible AWS, expand/collapse all, vendor marks), mutation UX, typography, accessibility, and anti-patterns.

When this skill matches a task, **read and follow the rule file** for full implementation details.

---

## Pre-flight checklist (verify before every component save)

Run through all five checks before marking any UI change complete:

1. **No hardcoded hex or rgba** — every color must be a CSS token (`bg-(--accent)`, `text-(--danger)`, etc.). Exceptions: vendor logo fills only (`AWS #232F3E`, `Fly.io #7B36F6`).

2. **Page `h1` typography** — `text-2xl font-medium font-(family-name:--font-display)`. Never `text-3xl`. Never omit `font-medium`.

3. **Card and modal radius is `rounded-xl`** — not `rounded-lg`, not `rounded-2xl`. Buttons and error banners use `rounded-lg`. Form inputs use `rounded-md` or `rounded-lg`.

4. **Primary actions use `--accent`, never `--success`** — `bg-(--accent) text-white hover:opacity-90`. `--success` is reserved for health/status indicators.

5. **Focus rings on every input** — `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20`. Must be `ring-2`, must be `/20` opacity.

---

## Quick-reference token cheat sheet

| Purpose | Token |
|---------|-------|
| Page background | `bg-(--bg-deep)` |
| Sidebar / modal / header chrome | `bg-(--bg-elevated)` |
| Form fields / table backgrounds | `bg-(--bg-field)` |
| Hover row | `bg-(--bg-hover)` |
| Skeleton pulse | `bg-(--bg-muted) animate-pulse` |
| Modal backdrop | `bg-black/40` |
| Primary action | `bg-(--accent) text-white hover:opacity-90` |
| Danger badge fill | `bg-(--danger-muted)` or `bg-(--danger-dim)` (same value) |
| Warn badge fill | `bg-(--warn-muted)` or `bg-(--warn-dim)` (same value) |
| Success badge fill | `bg-(--success-muted)` or `bg-(--success-dim)` (same value) |

## Shadow tier

| Class | Use |
|-------|-----|
| `shadow-sm` | Cards, modals |
| `shadow-md` | Floating panels, popovers |
| `shadow-xl` | Prohibited on cards |

## Border radius tier

| Class | Use |
|-------|-----|
| `rounded-lg` | Buttons, error banners, badges |
| `rounded-xl` | Cards, modals, panels (default) |
| `rounded-2xl` | Prohibited in new code |
