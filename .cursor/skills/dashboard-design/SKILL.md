---
name: dashboard-design
description: Design B2B and SaaS dashboards using Excited-agency methodology — decision-first layout, role-based information hierarchy, research before pixels, and measurable UX. Use when building, redesigning, or reviewing dashboards, KPI screens, admin panels, CRM/ERP overviews, analytics views, or data-heavy product UI.
---

# Dashboard design (Excited method)

Methodology distilled from [Excited](https://excited.agency) — especially [Effective Dashboard UX](https://excited.agency/blog/dashboard-ux-design), their [commonsense process](https://excited.agency/blog/design-process-at-excited), and CRM / ERP / SaaS / healthcare writing.

A dashboard is a visual display of **key metrics and actions** in one place. It is not a gallery of charts. It exists so a specific person can **decide and act**.

> Define the decision first, then design the visualization around it.

> UX is not icing. It is structural — the flour, not the topping.

> A great dashboard is invisible: users focus on their data, not the design.

If this repo (or the current project) has its own design-system skill or tokens, **use those tokens**. This skill governs structure, hierarchy, and composition — not a competing palette.

## Additional resources

- Principles, types, research, and evaluation: [principles.md](principles.md)
- Layouts, widgets, charts, states: [patterns.md](patterns.md)
- Worked briefs → compositions: [examples.md](examples.md)

---

## Before any pixels

Do not open with a grid of stat cards. Answer these in writing (plan, PR, or component comment):

1. **Who** — primary role (operator, manager, analyst, exec, clinician, patient). One primary; others get variants, not one compromise screen.
2. **Decision** — the job this screen exists to finish. Example: “who needs attention now,” not “show activity.”
3. **Cadence** — operational (real-time + alerts), analytical (explore + compare), or strategic (trends + planning). Match density and refresh to cadence.
4. **Aha / time-to-insight** — the first useful answer a returning user should get in under a glance.
5. **Success metrics** — time to insight, task success (filter / export / act), ignored widgets, error rate on critical actions.

Skip artifacts that do not add value. Produce value, not process theater. Reuse existing research before inventing new interviews.

**Hierarchy of effort:** utility → usability → desirability. Never skip up the stack.

---

## Workflow

Copy and track:

```
Dashboard progress:
- [ ] 1. Role + decision + cadence named
- [ ] 2. Existing research / analytics reused
- [ ] 3. Information architecture (what is primary / secondary / hidden)
- [ ] 4. Wire composition (zones, not decoration)
- [ ] 5. Widgets each earn a place (or get cut)
- [ ] 6. Visualization chosen for the question, not the mood
- [ ] 7. Empty / loading / error / permission states
- [ ] 8. Role-based defaults + optional customization
- [ ] 9. Design-system consistency + a11y contrast
- [ ] 10. Evaluation plan (qual + time-to-insight)
```

### 1. Research before layout

Hard path (required unless the user already supplied research):

- Interviews for goals and friction — open questions, do not steer.
- Card sorting for module and nav labels — put things where users expect them.
- Usage data / session recordings for what is used vs ignored.

Easy path (avoid): averaging competitor dashboards and re-skinning.

Interviews give stories. Quant tells you how common the stories are.

### 2. Information architecture

- Frequent tasks sit in the first scan (F-pattern or Z-pattern).
- Role-based access: only show what that role can act on.
- Progressive disclosure: summary → exception → detail → action.
- Common items are prominent; rare power tools live in overflow, filters, or a dedicated view.
- Dashboards are the screens most worth wireframing. Keep wires quick and dirty.

### 3. Compose the screen

Default zone order (adapt, do not invent a fourth “pretty” zone):

| Zone | Purpose |
|------|---------|
| **Context** | Title, role/scope, time range, last updated, primary filters |
| **Decision strip** | 1–4 primary KPIs sized to matter; one is the hero |
| **Exceptions** | Alerts, anomalies, items that need action now |
| **Evidence** | The one or two charts/tables that justify the strip |
| **Work** | Queue, table, pipeline, or next actions |

Whitespace and grouping create scannable zones. Size highlights the primary KPI. Color is reserved for urgency, state, or category — not decoration.

### 4. Visualize to simplify

- Trends / comparisons → bar, line, or area.
- No 3D charts. No pies with many slices. No texture/color noise.
- One question per chart. A second question needs a second view — do not stack encodings.
- In high-stakes contexts (ops, health, finance), visualization is a safety feature. Clutter hides meaning.

### 5. Customize after good defaults

No single layout fits every role. Offer, in this order:

1. Strong role-based default (never start empty).
2. Saved filters / layouts for recurring jobs.
3. Hide/show unused sections.
4. Rearrangeable widgets — only after the default already works.

Empty states are not a friend. Use sample/sandbox data so first-run users can reach an aha before they import everything.

### 6. Clean UI (calm, not clever)

- Consistent spacing, alignment, typography.
- Prefer project tokens; never invent a one-off hex for “pop.”
- Icons may replace repeated labels if they have tooltips.
- Contrast meets accessibility. Dark mode is designed, not inverted.
- CTAs stand out without dominating the data.
- Microinteractions only for feedback (filter loading, tab change, widget add). No ornamental motion.

**Trends with intent:** minimalism and bento-style modules are useful for scanning mixed KPIs. Use neumorphism and liquid glass only as isolated accents — they destroy contrast on data.

### 7. Design system or do not scale

Without a component system: inconsistent spacing, duplicate widget skins, broken responsive. Build widgets from shared primitives (card, metric, chart frame, table, filter, badge, empty). Same job → same pattern.

---

## Hard rules

| Do | Do not |
|----|--------|
| Name the decision on the page (title or subtitle) | Title the page “Overview” / “Dashboard” with no job |
| One hero metric; supporting metrics stay smaller | Equal-weight walls of identical stat cards |
| Color for state (success / warn / danger / accent) | Rainbow charts, decorative gradients, glass on data |
| Show last-updated + range | Unlabeled “live” numbers with no provenance |
| Next action next to the insight | Charts with no path to a queue, record, or export |
| Role variants or progressive disclosure | One dense screen for exec + operator + analyst |
| Wireframe unusual dashboard screens | Jump straight to visual polish |
| Test with ~5 users per feature group, ~1 hour | Cram an entire product into one test |

---

## Anti-patterns (Excited)

1. **Build now, design later** — unclear flows, redundant widgets, redesign tax. Treat the dashboard as a product surface, not an engineering leftover.
2. **Design for Dribbble** — gradients, glassmorphism, over-animated transitions. Users should not notice the skin.
3. **Blind trend-following** — neumorphism, hyper-minimalism, liquid glass applied without checking the data or the role.
4. **No design system** — chaos across modules, especially ERP/CRM scale.
5. **Leadership-only design** — operators who live in the tool are ignored; adoption dies.
6. **Feature-complete clutter** — every control earned a ticket; none earned a place on this screen.

---

## Implementation notes (code)

When implementing in an existing app:

1. Read the project design-system skill/rule first. Tokens, radius, type, and focus rings win over this file’s aesthetics.
2. Map each widget to a named decision in a short comment or spec.
3. Prefer existing card / table / chart primitives. Do not invent a third card radius or a new status color.
4. Filters stay sticky when the user scrolls a long table or chart.
5. Loading: skeleton in the same geometry as the widget — not a centered spinner that collapses layout.
6. Errors: say what failed and what to do; never raw gateway codes.
7. Permissions: hide unauthorized widgets; do not show locked chrome the user cannot use.
8. Responsive: collapse to a single column; keep the hero KPI and exceptions; park secondary charts behind tabs or “more.”

If asked to both **fix** a dashboard and **add decorative trends**, fix the decision hierarchy first. Refuse glass/gradient noise that reduces contrast.

---

## Done when

A stranger in that role can, on first load:

1. See what this screen is for.
2. Read the one number or exception that matters.
3. Know whether it is good or bad (comparison, target, or delta).
4. Take the next action without hunting.

Then measure. A stunning dashboard that does not shorten time-to-insight is not done.
