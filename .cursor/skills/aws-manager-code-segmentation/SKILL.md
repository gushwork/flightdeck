---
name: aws-manager-code-segmentation
description: Defines how AWS Manager application code is segmented by feature module (Secrets, Audit, IAM, Settings, etc.) across UI routes, API handlers, lib/aws, components, and agent tools. Use when adding features, reorganizing code, wiring navigation, or extending lib/modules/registry.ts.
---

# Application code segmentation (AWS Manager)

## Goal

This app splits code by **feature module** (aligned with primary AWS surfaces: Secrets Manager, Access Analyzer, CloudTrail helpers, IAM when enabled, etc.). UI, server routes, AWS SDK wrappers, and agent tools stay **namespaced per module** so unrelated features do not accumulate in shared catch-alls.

## Naming

| Layer | Convention | Examples in this repo |
|-------|------------|------------------------|
| **Module id** (`ModuleId`) | Short slug for nav/registry | `secrets`, `audit`, `iam`, `settings` |
| **URL path** | `kebab-case`, module-scoped | `/secrets/*`, `/analyzer` (Access Analyzer UI) |
| **API** | `/api/<scope>/...` | `/api/secrets/*`, `/api/analyzer` |
| **lib/aws** | One file (or subfolder) per SDK domain | `secrets.ts`, `analyzer.ts`, `cloudtrail.ts` |
| **Components** | `components/<scope>/` | `components/secrets/*` |
| **Agent tools** | Groups in `AgentToolGroup`; map from modules in registry | `secrets`, `audit`, `cloudtrail`, `propose` |

Prefer **one primary module per feature area**. If a flow spans services (e.g. CloudTrail history for a secret), keep the **feature** under the owning module (`secrets`) and **reuse** shared helpers in `lib/aws/cloudtrail.ts` without merging unrelated UIs.

## Checklist: new feature area

1. **Registry** — Add or extend a `ModuleId` entry in [`lib/modules/registry.ts`](lib/modules/registry.ts): `enabled`, `MODULE_NAV` section (labels, `href`s), and `MODULE_AGENT_TOOLS` if the agent should call new tools.
2. **Server** — Add [`app/api/<scope>/`](app/api/) route handlers; only import the matching [`lib/aws/<client>.ts`](lib/aws/) module(s) and shared [`lib/aws/client.ts`](lib/aws/client.ts) options.
3. **AWS SDK** — Add or extend [`lib/aws/<domain>.ts`](lib/aws/) with typed functions; avoid unrelated calls in the same file unless they are tiny shared utilities in a neutral module (e.g. `workspace-query.ts`).
4. **UI** — Add [`app/<scope>/`](app/) pages and [`components/<scope>/`](components/) widgets; keep module-specific copy and layout here, not in generic layout shells.
5. **Agent** — Register tools in [`lib/agent/tools.ts`](lib/agent/tools.ts) and handlers in [`lib/agent/tool-handlers.ts`](lib/agent/tool-handlers.ts); ensure `getEnabledAgentToolGroups()` in the registry exposes the right groups.
6. **Types** — Prefer [`lib/types.ts`](lib/types.ts) or a colocated `types` module scoped to that area for DTOs used across UI and API.

## Anti-patterns

- Dumping multiple areas’ API routes under one folder (e.g. all under `/api/aws/`) without scoped subpaths.
- Importing another module’s client from a route “for convenience” — extract a small shared helper instead.
- Adding nav items in [`components/layout/sidebar.tsx`](components/layout/sidebar.tsx) without a corresponding `MODULE_NAV` entry (nav should stay driven by the registry).

## Cross-cutting concerns

- **Region and profile**: Use existing workspace context ([`lib/context/aws-workspace-provider.tsx`](lib/context/aws-workspace-provider.tsx)) and [`lib/aws/workspace-query.ts`](lib/aws/workspace-query.ts) for URLs; do not fork credential logic per module.
- **Change plans**: If `propose_change` targets a service, keep plan step metadata aligned with that service (e.g. `service: secretsmanager`) in the owning module’s flow.

## Optional reference

For a deeper map of current routes and files, see [`CODEBASE.md`](CODEBASE.md) at the project root.
