# Dashboard examples

Each example is a brief → composition. Copy the **Named decisions** block into the PR or component file.

---

## 1. Operational: “Who is broken right now?”

**Role:** on-call operator  
**Cadence:** operational (minutes)  
**Decision:** which incident or failing system do I touch first?  
**Aha:** the top exception is already sorted by severity.

```
Context:  Incidents · env: prod · last 24h · updated 20s ago
Decision: [Open sev-1: 2] [MTTA: 6m] [Failing checks: 14] [Deploys today: 3]
Exceptions: sev-1/2 list — service, symptom, age, ack/page
Evidence: error-rate line (this service vs baseline)
Work: failing checks table → open run / silence
```

Cuts: weekly unique users, marketing funnel, “team happiness.” Wrong cadence.

**Eval:** time from page-load to first ack; ignored widgets after a week.

---

## 2. Sales manager: “Where will this week close?”

**Role:** sales manager  
**Cadence:** sales / pipeline (daily)  
**Decision:** which deals need a manager assist before Friday?  
**Aha:** weighted pipeline vs quota, then the at-risk deal list.

```
Context:  Pipeline · team: West · this quarter · as of this morning
Decision: [Commit $] [Gap to quota] [Deals this week] [Slip count]
Exceptions: deals slipped ≥1 stage or no activity 7d
Evidence: stage bar (count + $) — not a 3D funnel
Work: deal table — name, amount, stage, last activity, owner, next step
```

AE variant: hide team gap; hero = “my commit”; work = my open deals only.

Customization: saved filters “closing this week”, “no activity.”

---

## 3. Strategic exec: “Are we compounding?”

**Role:** exec  
**Cadence:** strategic (weekly / monthly)  
**Decision:** is the business on plan, and which lever do I ask about?  
**Aha:** one north-star vs plan, then two supporting trends.

```
Context:  Company pulse · Q3 · updated Monday 08:00
Decision: [NRR] hero vs plan   [New logo] [Gross churn] [NPS]
Evidence: NRR line + plan band (quarter); second chart only if asked
Work: 3 narrative callouts — “what changed”, each linking to an analytical view
```

Cuts: live error rates, 20 equal KPI tiles, drag-and-drop chrome. Execs do not operate the board.

Density is low on purpose. If they want exploration, send them to an analyst view.

---

## 4. CRM CS: “Who is at risk?” (Ravel-shaped)

**Role:** customer success  
**Cadence:** operational + light analytical  
**Decision:** which accounts need a save motion this week?  
**Aha:** after connecting CRM (or sandbox), the risk list is already populated.

Onboarding: map CRM → pick signals to track → land on a **full** dashboard, not an empty state.

```
Context:  Accounts at risk · segment: enterprise · 30d
Decision: [At-risk accounts] [Logo churn $] [Health drop 7d]
Exceptions: accounts that crossed the risk threshold since last visit
Evidence: health score distribution (bar) — optional
Work: dynamic table — account, score, trigger, owner, last touch
       + notification prefs for “new risk”
```

Filters and column customization come **after** the default risk sort works.

---

## 5. ERP: two roles, two defaults

**Warehouse manager (ops)**  
Decision: what will miss the dock today?  
Hero: late pick lines. Work: wave / order queue. Evidence: none required on first screen.

**CFO (strategic)**  
Decision: are we cash-safe this month?  
Hero: cash vs forecast. Evidence: 13-week cash line. Work: exceptions over threshold.

Same product, **not** the same widgets with different CSS. RBAC hides the other role’s modules.

---

## 6. Healthcare clinician vs patient

**Clinician** — Decision: who needs attention now?  
Dense table: patient, signal, since, protocol action. Color only on unsafe deltas. Confirmations on risky actions. Test under interruption.

**Patient** — Decision: is this trend normal, and what do I do?  
One chart, plain language, good/bad vs expected range, one next step, contact path. No raw device dumps.

Visualization is a safety feature. If meaning is buried, the UI failed regardless of polish.

---

## 7. Redesign audit (existing noisy dashboard)

Use when the user says “this dashboard is a mess” and there is no new feature.

1. Stakeholder: what business metric should move?
2. Analytics: which widgets have near-zero clicks? Kill or bury those first.
3. Heuristic pass (Nielsen) on the remaining surface — severity × effort.
4. Re-state the single decision; rebuild zones from [patterns.md](patterns.md).
5. Prototype the new IA; 5-user test: “Show me what you’d do first this morning.”
6. Ship the role default; leave customization for a follow-up if usage data asks for it.

Do not restyle first. Excited treats “design for Dribbble” as a named failure mode.

---

## Spec comment template

Paste above the page component:

```
Role: …
Decision: …
Cadence: operational | analytical | strategic | sales
Hero metric: …
Exceptions: …
Primary action: …
Out of scope on this screen: …
Success: time-to-insight / task …
```
