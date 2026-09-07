# Dashboard principles (Excited)

Read this when you need the why behind [SKILL.md](SKILL.md). Sources are Excited essays, not generic dashboard folklore.

## What a dashboard is

A dashboard brings together **key data points, controls, and summaries** so users get an immediate view of what matters — sales, KPIs, system status — and can act.

It is not:

- A dumping ground for every metric the warehouse can emit
- A portfolio piece
- A substitute for the underlying workflow (queue, record, report)

Excited’s healthcare rule generalizes: every dense screen should answer **What does this mean? Is it good or bad? What should I do next? Who/where do I go?**

## Utility → usability → desirability

From their SaaS UX writing (NN/g framing they use constantly):

1. **Utility** — does this screen help the job? No polish fixes a dashboard that answers the wrong question.
2. **Usability** — can they finish the job under time pressure, interruption, and incomplete data?
3. **Desirability** — calm, trust, confidence. In ops and health, desirability *is* lower anxiety and cognitive load — not “pretty.”

Diagnose which layer is broken before restyling:

| Signal | Utility problem | Usability problem |
|--------|-----------------|-------------------|
| Engagement | Low frequency, abandon | Spend time but struggle |
| Feedback | “Not relevant / not valuable” | “Can’t find / don’t understand” |
| Competitors | Similar features, more loved | Same features, easier |
| Fix that works | Change what is shown / the job | Change nav, hierarchy, steps |

They report almost never seeing desirability-only failures. Do not start a dashboard project with a reskin.

## Dashboard types (match cadence)

| Type | Job | Design consequences |
|------|-----|---------------------|
| **Operational** | Day-to-day activity | Real-time or near-real-time, anomaly alerts, short time windows, dense queues |
| **Analytical** | Explore, compare, explain | Filters, breakdowns, drill-down, export; slower cadence |
| **Strategic** | Planning, forecasting | Long ranges, fewer KPIs, narrative comparisons, low chrome |
| **Sales / pipeline** | Performance and next deals | Funnel + list, activity, risk; role-specific (AE vs manager) |

Mixing cadences on one canvas is the usual source of clutter. Split views or tabs rather than one “god dashboard.”

## Role-based hierarchy

Excited’s B2B and ERP rule: a warehouse manager and a CFO do not share a dashboard. Clinicians need density and speed; patients need plain language and next steps; admins need throughput.

Do this:

- Name roles (operator, manager, analyst, exec — or domain-specific).
- For each role, list **daily decisions**, not feature requests.
- Show only what that role can act on (RBAC as UX, not just security).
- Default layout is role-specific. Customization is a layer on top.

Card sorting is their default IA tool: frequent items prominent; labels from user language, not internal system names.

## Immersion-first process

From [How we do it at Excited](https://excited.agency/blog/design-process-at-excited) and [web app design](https://excited.agency/blog/web-app-design-services):

1. **Kick-off** — business goals, stakeholders, who decides. Position design as a means to those goals.
2. **Secondary research** — reuse interviews, personas, analytics, prior wires. “There’s no such thing as starting from square one.”
3. **User research** — unstructured interviews until answers repeat. Quant (surveys, product analytics) to size the stories.
4. **IA + flows** — skip flows only when the product is simple and already agreed.
5. **Wireframes** — when much is unknown. Especially dashboards. Quick and dirty so nobody falls in love with chrome.
6. **Prototype over slides** — interactive Figma (or coded) to test and to hand off.
7. **Usability test** — ~5 users per feature group; keep sessions ~1 hour; do not cram the whole product. Moderated for critical flows; unmoderated for small iterations.
8. **Design system in parallel** with hi-fi — components, states, dark/light as variables, not an afterthought.
9. **Launch is the start** — track what is used, ignored, and broken. Iteration is part of the method.

Common sense over checklists: skip a step when it will not change the decision. Do not skip research to “save time.”

## Research methods they actually use

| Method | Use on dashboards |
|--------|-------------------|
| Stakeholder interviews | Goals, politics, what “success” means — not as a substitute for end users |
| End-user interviews | Pain, current tools, why they are leaving the last system |
| Card sorting | Module names, nav, widget grouping |
| Usage / session data | Ignored widgets, rage clicks, long click paths |
| Heuristic audit | Nielsen’s 10; severity × effort. See [UX audit checklist](https://excited.agency/blog/ux-audit-checklist) |
| Usability test | “Find who is at risk” / “export last week” / “change the date range” |
| Competitive analysis | How others solve the *job*, not which chart library they use |

Younger products interview more. Mature products lean on analytics + targeted tests.

## Onboarding and first insight

From CRM and onboarding essays:

- Time-to-value is the aha: **their data (or honest sample data) answering their job**.
- Empty dashboards kill activation. Sandbox / demo data is a product feature.
- Migration (CSV, previous CRM, mixed tools) is part of dashboard UX, not a backend chore.
- Onboarding is skippable and resumable. Always available; not mandatory theater.
- Personalize first-run by role or industry when the product spans audiences.
- Intensity matches complexity: tooltip vs checklist vs guided tour — often combined.

Ravel’s lesson: connect the source + map what to track, then land on a screen **already full of insights**.

## Customization without chaos

Excited pushes rearrangeable widgets, hide/show, and saved filters — especially ERP/CRM. Guardrails:

- Defaults must already match the role. Customization is not an excuse for a blank canvas.
- Saved views beat infinite drag-and-drop for most B2B users.
- Do not let customization hide mandatory compliance / safety widgets for that role.

## DesignOps and systems

CRMs and ERPs have many modules and many designers. A component library is necessary but not sufficient — **usage rules** must be enforced (DesignOps). Same widget job → same pattern. Inconsistent icons, labels, and card skins are treated as usability bugs.

Dark mode is designed from the start (variables), with contrast and highlight states checked. Inverting light tokens is not dark mode.

## Integrations as UX

Manual status updates and duplicate entry are dashboard failure modes. Calendar, email, source-of-truth sync belong in the workflow around the dashboard. Plan integrations on day one so the dashboard is a nervous system, not another silo.

## Evaluation — is it a great dashboard?

Not “does it look like a case study.”

**Qualitative**

- Do they find what they need quickly?
- Confused, overwhelmed, unsure where to click?
- Skipping the widgets you thought were primary?

**Quantitative** (from [dashboard UX](https://excited.agency/blog/dashboard-ux-design) and [UX metrics](https://excited.agency/blog/ux-metrics))

| Metric | Question |
|--------|----------|
| Time to insight | How long until they can act on the data? |
| Task success | Filter, compare, export, open the right record? |
| Click paths | Extra steps to the decision? |
| Feature usage | Which widgets are never touched? |
| Error rate | Failures on critical actions |
| Return / retention | Do they come back to *this* screen? |
| NPS (high-stakes dashboards) | Would they recommend this workspace? |

Prioritize metrics bottom-up: usability first, then business (activation, retention), then strategy. A beautiful unused widget is a failed hypothesis — remove or demote it.

## Copy

UX writing is not an afterthought. Most of a dashboard is text: titles, deltas, empty states, errors, filter labels. Never dump raw gateway codes. Say what happened and what to do. Use user language from card sorting, not schema names.

## Sources (Excited)

- [Effective Dashboard UX](https://excited.agency/blog/dashboard-ux-design)
- [Commonsense-Based Design Process](https://excited.agency/blog/design-process-at-excited)
- [How to Choose a SaaS Design Partner for B2B Dashboard Redesign](https://excited.agency/blog/saas-design-agency-b2b-dashboard)
- [CRM Design: 7 Best Practices](https://excited.agency/blog/crm-design)
- [ERP Software UX](https://excited.agency/blog/erp-design)
- [SaaS UX Design Best Practices](https://excited.agency/blog/ux-design-for-saas)
- [Healthcare UX](https://excited.agency/blog/healthcare-ux)
- [Key UX Metrics](https://excited.agency/blog/ux-metrics)
- [UX Audit Checklist](https://excited.agency/blog/ux-audit-checklist)
- [Web App Design Services](https://excited.agency/blog/web-app-design-services)
- [Ravel case study](https://excited.agency/works/ravel)
