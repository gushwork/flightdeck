# Codebase Knowledge Base

> Living document — updated by the agent on every substantive edit.  
> Read this first when starting a new task.

## Agent docs & code search

- [`AGENTS.md`](AGENTS.md) / [`CLAUDE.md`](CLAUDE.md) — agent instructions; prefer **graphify** symbol lookup before `Grep`/`Glob`.
- [`.agents/skills/graphify/SKILL.md`](.agents/skills/graphify/SKILL.md) — `/graphify` commands; index at `graphify-out/graph.json` (manual `build` / `update` / `auto-update`).

## Project Overview

Flightdeck — a web app covering **AWS** (Secrets Manager, Amplify Gen 1, Route 53 / Fly domains, VPC multi-view explorer (read-only), IAM Access Analyzer, IAM cross-account copy, CloudTrail), **GitHub Actions** monitoring and control, and **Fly.io** app health and secrets management. The AI chat agent was **removed** (2026-08-25); all data flows only to AWS/GitHub/Fly APIs with local credentials.

Target: single operator managing secrets, Amplify env configuration, access findings, and GitHub Actions workflows for a small team, one or more AWS accounts via profiles.

## Module registry

- [`lib/modules/registry.ts`](lib/modules/registry.ts) — toggles **Secrets**, **Amplify**, **Audit** (Access Analyzer), **Route 53**, **VPC**, **Utility** (IAM tools), **GitHub**, **Fly.io**, and **Settings** nav; optional `NavItemDef.children` for collapsible groups.

## Directory Structure

```
.
├── PRD.md
├── AGENTS.md              # Agent instructions (graphify-first code search)
├── CLAUDE.md              # Claude-specific project instructions
├── CODEBASE.md
├── graphify-out/graph.json # Structural AST index (graphify build)
├── lib/
│   ├── types.ts            # SecretEntry, SecretSearchResult, SecretValue, Amplify* DTOs
│   ├── utils.ts
│   ├── secret-value-format.ts
│   ├── secret-string.ts      # coerceSecretStringForStorage — API create/PUT + lib/aws create/put always store SecretString as UTF-8 text
│   ├── amplify-env-map.ts    # JSON / .env parsing for Amplify env maps (reuses secret-value-format)
│   ├── db.ts                 # Optional Postgres pool (DATABASE_URL) for server cache
│   ├── cache.ts              # getCached / setCache / invalidateCache — secrets list + tool handler cache
│   ├── dashboard/
│   │   └── exceptions.ts     # Client-safe exception row builders for home "Needs attention" inbox (GitHub, secrets, Fly)
│   │   └── legacy-redirect.ts # legacyDashboardRedirect() — /aws, /github/overview, /secrets/{overview,search}, /amplify/search
│   ├── modules/
│   │   └── registry.ts     # Feature flags + nav; ModuleId now includes "github"
│   ├── context/
│   │   ├── aws-workspace-provider.tsx # Region + profile; saved profile names load after mount (hydration-safe); env + aws-saved-profiles; notifyAwsProfileListChanged
│   │   ├── data-provider.tsx # Secrets list; reloads on region/profile change
│   │   └── github-data-provider.tsx # Smart-polling GitHub Actions data; tiered intervals (8s active, 15s recent-fail, 60s idle); pauses on tab blur; immediate refetch after mutations; optimistic updates
│   ├── hooks/
│   │   ├── use-secrets.ts  # Standalone secrets fetcher (DataProvider is primary for UI)
│   │   └── use-singleton-popover-dismiss.ts # Dismiss anchored popovers on outside click / Escape (data-popover-root + data-popover-key)
│   └── aws/
│       ├── client.ts      # getRegion, awsClientOptions (fromIni), profileCacheSegment, parseProfileParam
│       ├── regions.ts     # AWS_REGIONS, AWS_REGION_LOCATIONS, formatRegionMenuLabel
│       ├── workspace-query.ts # workspaceSearchParams(region, profile) for fetch URLs
│       ├── secrets.ts      # list, batch get, get/put value, create, versions, describe, resource policy
│       ├── amplify.ts      # ListApps, app snapshot, branch env, search env vars, UpdateApp/UpdateBranch env
│       ├── iam.ts          # IAM search, exists, copy (roles/users/customer-managed policies), create-user (console access + keys + permission cloning from template); ListUsers, CreateLoginProfile, CreateAccessKey, password policy handling, sign-in URL generation
│       ├── sts.ts          # getAccountId via GetCallerIdentity
│       ├── vpc.ts          # EC2: listVpcs — account-wide Describe* once, grouped per VPC (subnets, RTs, IGW/EIGW, NAT, endpoints, instances, ENIs, SGs, NACLs, peering, TGW, VGW, flow logs, DHCP); optional calls degrade to `warnings`; merges vpc-services.ts results
│       ├── vpc-services.ts # ELBv2 (listeners/rules/target health), RDS, Lambda (SWR cache + 3s budget → `pending`), ElastiCache, ECS; drain/optional helpers; header rule values masked
│       ├── analyzer.ts
│       └── cloudtrail.ts
├── lib/github/
│   ├── client.ts           # gh CLI token extraction (exec `gh auth token`), 30-min in-process cache, `githubFetch` + `githubFetchPaginated` helpers
│   ├── types.ts            # GHRepo, GHWorkflowRun, GHWorkflow, GHRunsSummary DTOs + status/conclusion union types; GHWorkflowListItem/Detail; computeSummary (client-safe); WorkflowDispatchInputSpec / WorkflowDispatchSchemaResponse
│   ├── github-urls.ts      # Client-safe: isValidHttpsBadgeUrl, githubActionsWorkflowPageUrl (Actions UI vs file blob)
│   ├── workflow-dispatch-schema.ts # Server-only: yaml → parse workflow_dispatch.inputs
│   ├── workflow-dispatch-client.ts # initialDispatchInputValues, validate, serialize for POST body
│   ├── actions.ts          # listUserRepos, listWorkflows, listRepoRuns, listAllRuns (batched parallel); rerun/rerunFailed/cancel/dispatch/enable/disable/getRunLogsUrl; fetchAllWorkflowsFast; getWorkflowDetail
│   ├── secrets-types.ts    # Client-safe DTOs for secrets hub inventory, mutations, drift
│   ├── secrets-constants.ts # Cache key, TTL, concurrency knobs (repo=16, org=8, env=4)
│   ├── parallel-pool.ts    # Bounded-concurrency worker pool for scans
│   ├── filter-index.ts     # Client-safe filterIndexRows (dashboard filters locally)
│   ├── secrets-crypto.ts   # libsodium sealed-box encryption for GitHub secret PUT
│   ├── secrets.ts          # Actions org/repo/env list + set/delete; parallel intra-repo fetch
│   ├── secrets-indexer.ts  # Full inventory scan via parallelPool, cache (PG + memory)
│   ├── secrets-drift.ts    # Presence-based drift across repos
│   ├── secrets-bulk.ts     # Multi-target mutation orchestration
│   ├── secrets-dependabot.ts / secrets-codespaces.ts # Wave 3 platform fetchers
│   └── secrets-platform-registry.ts # PLATFORM_FETCHERS plugin list for indexer
├── lib/runner/
│   ├── types.ts            # Client-safe RunnerSnapshot / RunnerJob / RunnerConfigView DTOs
│   ├── config.ts           # Server-only: host/user from Settings file (`~/.flightdeck/runner-vm.json`) > env / `.env.azure`; validation; `configView()` (tested in config.test.ts)
│   ├── parse.ts            # Pure: pairs Runner-log events with Worker-log metadata by planId → jobs, state, stats (tested in parse.test.ts)
│   ├── remote-script.ts    # Read-only python3 snapshot script piped to the VM over `ssh … python3 -`
│   └── ssh.ts              # Server-only: ssh + SSH_ASKPASS password auth, 4s shared cache (`clearRunnerCache`)
├── lib/vpc/                # Client-safe, pure (unit-tested: *.test.ts)
│   ├── types.ts            # VpcDetail + subnet/RT/SG/NACL/ENI/peering/load balancer/service DTOs, VpcCoverage, VpcFinding, VpcViewId
│   ├── cidr.ts             # IPv4 CIDR math: parse/normalise, overlap, freeBlocks, freeBlocksOfSize
│   ├── routing.ts          # classifyTier (public/private/isolated), resolveRoute (longest prefix, link-local), describeTarget
│   ├── eni.ts              # classifyEni — owning service from ENI type/description (ALB/NLB, RDS, Lambda, ECS…)
│   ├── review.ts           # reviewVpc design/hygiene findings (incl. LB/RDS/ECS/cache/Lambda), scoreOf (per-rule diminishing), gradeOf, worldRisk
│   ├── resources.ts        # buildResourceRows (real services first; ENI guesses only when a service API was unreadable), rowsToCsv, KIND_LABEL, lbHealth
│   ├── planner.ts          # buildCells (≤256-cell address map), suggestLayout (tier × AZ first-fit)
│   ├── links.ts            # consoleUrl deep links into the AWS console
│   └── export.ts           # vpcToMarkdown, downloadText
├── lib/fly/
│   ├── types.ts            # FlyApp, FlyAppStatus, FlyMachine, MachineCheck, FlySecret DTOs (client-safe)
│   └── cli.ts              # flyctl binary resolution (flyctl → fly), execFile JSON helpers, listApps, getAppStatus, getAppsStatus (bounded concurrency), listSecrets, setSecrets (stdin import), unsetSecrets
├── components/
│   ├── layout/
│   │   ├── shell.tsx       # Sidebar + main content (agent column removed)
│   │   ├── topbar.tsx      # Renamed "Flightdeck" brand (was AWS Manager)
│   │   ├── sidebar.tsx     # Registry-driven nav; collapsible AWS shell; expand/collapse all; brand marks + route-synced expansion; GitHub activity dot when Actions are busy
│   │   ├── loading-skeleton.tsx
│   │   └── stale-badge.tsx
│   ├── github/
│   │   ├── run-utils.tsx        # Shared: StatusIcon, EventBadge, ElapsedTimer, formatDuration, relativeTime, isActiveStatus, isFailedConclusion
│   │   ├── run-card.tsx         # Reusable workflow run card: status icon, metadata, contextual action buttons (cancel/re-run/view-logs)
│   │   ├── run-filters.tsx      # Filter bar: status/repo/workflow/branch dropdowns + sort
│   │   ├── dispatch-dialog.tsx  # Repo/workflow pickers + WorkflowDispatchForm (YAML inputs from dispatch-schema API)
│   │   ├── workflow-dispatch-form.tsx # Ref + dynamic inputs; fetches GET …/dispatch-schema
│   │   ├── use-run-mutations.ts # Hook: rerun/rerunFailed/cancel with optimistic updates and error handling
│   │   ├── workflow-badge-image.tsx # Workflow status SVG from badge_url; https guard + onError hide
│   │   └── workflow-drawer.tsx  # Slide-over: overview (stats, last run, badge), runs (event/conclusion, re-run failed), YAML; Actions URL + file URL; collapsible dispatch w/ feedback
│   ├── vpc/
│   │   ├── vpc-provider.tsx    # VpcProvider/useVpcs: one fetch shared by list + detail (layout-scoped), stale-guarded, focus revalidate, re-polls while `pending`
│   │   ├── vpc-list.tsx        # /vpc: totals, overlap banner, VPC cards with health ring + mini tier×AZ map
│   │   ├── vpc-detail.tsx      # /vpc/[vpcId]: header, stats, ?view= tabs (9), breadcrumbs, shortcuts (1–9, /, r, ?, Esc), ?res= drawer
│   │   ├── lb-view.tsx         # Load balancers: listener → rule → target group → target health tracing
│   │   ├── resource-drawer.tsx # Slide-over details for any resource row; links to topology/security/LB views
│   │   ├── topology-view.tsx   # Tier × AZ matrix, IGW flow line, gap cells, related-RT ring + inspector.tsx side panel
│   │   ├── resources-view.tsx / subnets-view.tsx / routing-view.tsx (route tester) / security-view.tsx
│   │   ├── connectivity-view.tsx / planner-view.tsx (address map, free blocks, CIDR check, layout) / review-view.tsx
│   │   └── health-ring.tsx, refresh-control.tsx, ui.tsx (Chip, CopyId, CountUp, UtilBar, ConsoleLink…)
│   ├── amplify/
│   │   ├── env-vars-editor.tsx
│   │   └── amplify-env-bulk-modal.tsx
│   ├── fly/
│   │   └── fly-secrets-bulk-panel.tsx # Key–value / JSON / .env bulk set panel (reuses amplify-env-map + secret-value-format parsers)
│   ├── iam/
│   │   └── overwrite-copy-dialog.tsx # Overwrite checkbox when target entity exists
│   ├── secrets/
│   │   ├── bulk-edit-modal.tsx
│   │   └── secret-value-editor.tsx
│   ├── confirm-dialog.tsx
│   └── floating-action-bar.tsx
├── app/
│   ├── globals.css         # Design tokens + @theme font aliases
│   ├── layout.tsx          # Fraunces, DM Sans, IBM Plex Mono
│   ├── page.tsx            # Needs attention dashboard (exception inbox; no tool directory)
│   ├── settings/page.tsx
│   ├── design-system/page.tsx # Tokens + sidebar conventions summary; canonical detail in `.cursor/rules/design-system.mdc`
│   ├── iam/page.tsx        # IAM module sub-dashboard (links to utilities)
│   ├── iam/cross-account-copy/page.tsx # Search + copy UI
│   ├── iam/create-user/page.tsx
│   ├── amplify/page.tsx           # List Amplify apps
│   ├── amplify/search/page.tsx    # Env variable search across apps/branches
│   ├── amplify/[appId]/page.tsx  # App detail + per-branch env editing
│   ├── secrets/...
│   ├── analyzer/page.tsx
│   ├── vpc/layout.tsx             # Mounts VpcProvider so list ↔ detail navigation is instant
│   ├── vpc/page.tsx               # VPC list
│   ├── vpc/[vpcId]/page.tsx       # VPC detail (multi-view via ?view=)
│   ├── github/
│   │   ├── page.tsx            # Actions summary dashboard: stat ribbon (in-progress/queued/24h-success/24h-failed), active runs, recent failures, health bars; j/k/1/2 keyboard nav
│   │   ├── runs/page.tsx       # All-runs card grid: filterable (status/repo/workflow/branch), URL-synced, 2D arrow-key nav, dispatch trigger
│   │   ├── workflows/page.tsx  # Workflow grid: badge, single Run popover (useSingletonPopoverDismiss), WorkflowDispatchForm; last run cross-ref; drawer on card
│   │   ├── runner/page.tsx     # Azure VM self-hosted runner: live state (busy/idle/offline), VM stats, job history from runner _diag logs; smart polling (8s busy / 15s idle, paused when hidden)
│   │   └── secrets/page.tsx    # Secrets hub: inventory dashboard, filters, repo drawer, drift audit, bulk edit
│   ├── fly/
│   │   ├── overview/page.tsx   # Fly app health grid: machines, regions, checks, deploy time; links to secrets and Fly dashboard
│   │   └── secrets/page.tsx    # Per-app secrets CRUD: app selector (SearchableSelect), table with set/unset, bulk panel (Key–value / JSON / .env modes via FlySecretsBulkPanel)
│   └── api/
│       ├── amplify/
│       │   ├── apps/route.ts
│       │   ├── apps/[appId]/route.ts
│       │   ├── apps/[appId]/branches/[branchName]/route.ts
│       │   └── search/route.ts
│       ├── analyzer/route.ts
│       ├── iam/ (search, exists, copy, whoami, users, create-user)
│       └── secrets/...
│       ├── fly/
│       │   └── apps/
│       │       ├── route.ts                    # GET list apps (optional ?status=1 for health)
│       │       └── [app]/
│       │           ├── status/route.ts         # GET app status (machines, health)
│       │           └── secrets/route.ts        # GET list secrets; POST set/unset
└── .cursor/
```

## Architecture Decisions

- **Module registry**: Navigation is driven by one config so features can be toggled or re-added without scattered conditionals.
- **DataProvider**: Loads **secrets** only; refetches when **region** or **profile** changes (see `AwsWorkspaceProvider`).
- **AWS profile**: Optional named profile per request (`profile` query/body); server uses `@aws-sdk/credential-providers` `fromIni` when set; otherwise default credential chain. Cache keys: `secrets:{region}:{profileSegment}`.
- **Server cache (optional)**: When `DATABASE_URL` is set, [`lib/cache.ts`](lib/cache.ts) uses Postgres for TTL’d JSON cache (secrets list reads). Missing DB or connection errors fall back to uncached behavior; cache invalidation on secret create/delete/update routes.
- **IAM cross-account copy**: Source = workspace profile; target = **named** profile only (`/api/iam/copy` and `/api/iam/exists` require non-empty `targetProfile`). IAM entities are **global per AWS account** (not regional); region is still passed for SDK clients. User copy does not migrate passwords, MFA, or access keys.

## Patterns & Conventions

- **Application code segmentation** — [`.cursor/skills/aws-manager-code-segmentation/SKILL.md`](.cursor/skills/aws-manager-code-segmentation/SKILL.md): segment UI, `app/api/*`, `lib/aws/*`, and components by feature module; use registry as the single nav toggle source.
- **Dashboard UX (Excited method)** — [`.cursor/skills/dashboard-design/SKILL.md`](.cursor/skills/dashboard-design/SKILL.md): decision-first, role-based dashboards; tokens still come from the design-system skill / `design-system.mdc`.
- **Path alias**: `@/*` → project root
- **Design tokens**: `:root` in [`app/globals.css`](app/globals.css); Tailwind v4 `bg-(--token)`. Page chrome: `--bg-deep` (~`#fafafa`). **Fields, tables, data panels, secondary/outline controls**: `--bg-field` / `--bg-surface` / `--bg-card` (white); `--bg-hover` for hover on those surfaces.
- **Fonts** (see [`app/layout.tsx`](app/layout.tsx)): Fraunces (`--font-display`), DM Sans (`--font-sans`), IBM Plex Mono (`--font-mono`); classes `font-(family-name:--font-display|mono)`
- **Light theme**
- **AWS SDK v3** in `lib/aws/*`
- **Route handlers**: Next.js 16 App Router, `dynamic = 'force-dynamic'` where needed

## Dependencies

| Package | Purpose |
|---------|---------|
| `@aws-sdk/client-secrets-manager` | Secrets Manager |
| `@aws-sdk/client-amplify` | Amplify (Gen 1) apps and env configuration |
| `@aws-sdk/client-accessanalyzer` | Access Analyzer |
| `@aws-sdk/client-cloudtrail` | CloudTrail lookup |
| `@aws-sdk/client-iam` | IAM search and cross-account copy |
| `@aws-sdk/client-sts` | GetCallerIdentity / account id |
| `@aws-sdk/credential-providers` | `fromIni` for named profiles on API routes |
| `pg` | Optional Postgres for [`lib/cache.ts`](lib/cache.ts) when `DATABASE_URL` is set |
| `next` 16.3.4 | App Router; `allowedDevOrigins` includes `127.0.0.1` for Electron/`electron:dev`; `agentRules: false` so Next does not rewrite `AGENTS.md` |

## API Surface (current)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/secrets/list?region=&profile=` | List secrets metadata |
| POST | `/api/secrets/values` | Body: `query`, `region`, optional `profile` |
| GET/PUT | `/api/secrets/[id]?region=&profile=` | Get/put secret |
| GET | `/api/secrets/[id]/versions?region=&profile=` | Versions |
| GET | `/api/secrets/[id]/history?region=&profile=` | CloudTrail GetSecretValue events |
| POST | `/api/secrets/create` | Body: `name`, `secretString`, optional `description`, `tags`, `region`, `profile` — creates secret in Secrets Manager |
| POST | `/api/secrets/delete` | Body: `secretNames`, `region`, optional `profile` |
| GET/POST | `/api/analyzer` | Query/body: `region`, optional `profile` |
| GET | `/api/amplify/apps?region=&profile=&nextToken=` | Paginated Amplify app list |
| GET | `/api/amplify/apps/[appId]?region=&profile=` | App snapshot (branches + environment variables) |
| PUT | `/api/amplify/apps/[appId]` | Body: `environmentVariables` — update app-level env vars |
| PUT | `/api/amplify/apps/[appId]/branches/[branchName]` | Body: `environmentVariables` — update branch env vars |
| POST | `/api/amplify/search` | Body: `query`, `region`, optional `profile` — search env values/names across apps and branches |
| POST | `/api/iam/search` | Body: `region`, optional `profile`, `query`, optional `types` (`role` \| `user` \| `policy`) — search IAM entities (paginated caps) |
| POST | `/api/iam/exists` | Body: `region`, required `targetProfile`, `entityType`, plus `roleName` / `userName` / `sourcePolicyArn` — collision check in target account |
| POST | `/api/iam/copy` | Body: `region`, optional `sourceProfile`, required `targetProfile`, `entityType`, `overwrite`, optional `deepCopy` (default false), identifiers — copy role, user, or customer-managed policy; deep copy adds groups for users, tags/boundary/instance profiles for roles, and policy attachment principals for managed policies (capped) |
| GET | `/api/iam/users?region=&profile=` | List IAM usernames in current account/profile |
| POST | `/api/iam/create-user` | Body: `region`, optional `profile`, `newUserName`, `templateUserName`, optional `includeGroups` — creates user, copies permissions from template, adds console password (PasswordResetRequired=true), access key; returns sign-in URL + credentials |
| GET | `/api/iam/whoami?region=&profile=` | Returns `accountId` for labels |
| GET | `/api/vpc?region=&profile=` | `{ vpcs: VpcDetail[], warnings, pending }` — read-only detail for every VPC in the region incl. load balancers, RDS/Lambda/ElastiCache/ECS, `findings`/`score` |
| GET | `/api/github/repos` | List all repos the authenticated gh CLI user can access |
| GET | `/api/github/actions/runs?status=&repo=` | List workflow runs across repos (batched, 30/repo); computed summary |
| POST | `/api/github/actions/runs` | Body: `action` (rerun\|rerun-failed\|cancel), `repoFullName`, `runId` |
| GET | `/api/github/actions/workflows?repo=` | List workflows across repos |
| POST | `/api/github/actions/workflows` | Body: `action` (dispatch\|enable\|disable), `repoFullName`, `workflowId`, optional `ref`/`inputs` |
| GET | `/api/github/actions/runs/[runId]/logs?repo=` | Returns download URL for run logs |
| GET | `/api/github/actions/workflows/list?repo=` | Fast workflow list: capped repos, parallel, timeouts; card grid fields only |
| GET | `/api/github/actions/workflows/detail?repo=&workflowId=` | Full workflow detail: metadata + 15 recent runs + YAML file content (parallel) |
| GET | `/api/github/actions/workflows/dispatch-schema?repo=&workflowId=` | Parses workflow YAML for `workflow_dispatch.inputs`; returns `suggestedRef` (default branch) |
| GET | `/api/github/runner` | Azure VM runner snapshot read over SSH: `{ snapshot }` (state, supervisor, VM stats, current job, job history) or `{ error }` with 502 |
| GET/PUT | `/api/github/runner/config` | Runner VM host/user: GET returns `{ config }` (saved overrides, effective values + source, `hasPassword`; never the password); PUT `{ host?, user? }` saves to `~/.flightdeck/runner-vm.json` (empty = remove override). PUT requires same-origin `application/json` (else 403) because the host receives the SSH password |
| GET | `/api/github/secrets/index` | Cached secrets/variables inventory across repos (Postgres TTL or in-memory) |
| POST | `/api/github/secrets/index` | Force refresh inventory scan |
| GET | `/api/github/secrets/search` | Filter inventory (`q`, `owner`, `scope`, `platform`, `kind`, `repo`, `environment`) |
| GET | `/api/github/secrets/repo?fullName=` | Repo cockpit: repo/env/org secrets + variables |
| POST | `/api/github/secrets/mutations` | Single-target set/delete secret or variable (`preview` flag) |
| GET | `/api/github/secrets/drift` | Presence drift: secret names missing in some repos |
| POST | `/api/github/secrets/bulk` | Multi-target bulk set/delete with preview |

## GitHub Secrets Hub — performance

- **Scan**: [`lib/github/parallel-pool.ts`](lib/github/parallel-pool.ts) bounds concurrency (16 repos, 8 orgs, 4 envs per repo). Intra-repo Actions calls run in parallel ([`lib/github/secrets.ts`](lib/github/secrets.ts)). Dependabot/Codespaces tasks share the same pool ([`lib/github/secrets-indexer.ts`](lib/github/secrets-indexer.ts)).
- **Index payload**: variable **names** only in cache — no plaintext `value` (smaller JSON). Values load in repo cockpit via `GET /api/github/secrets/repo`.
- **Listing**: dashboard filters in-browser with [`lib/github/filter-index.ts`](lib/github/filter-index.ts); debounced URL sync (300ms); paginated table (50 rows/page). `GET /api/github/secrets/search` kept for shareable deep links.
- **Tests**: `npm run test` (unit); `npm run test:perf` (filter 10k rows <30ms, scan 200 repos mocked <5s). Config: `vitest.config.ts`, `vitest.perf.config.ts`.

| GET | `/api/fly/apps?status=1` | List Fly apps (optional `?status=1` adds per-app machine health) |
| GET | `/api/fly/apps/[app]/status` | App status: machines, regions, checks, health badge |
| GET | `/api/fly/apps/[app]/secrets` | List secret names + digests (values never returned) |
| POST | `/api/fly/apps/[app]/secrets` | Body: `{ set?: Record<string,string>, unset?: string[] }` — set/remove secrets via flyctl |

## Access Analyzer & CloudTrail

- Analyzer + CloudTrail behavior unchanged in `lib/aws/analyzer.ts` and `lib/aws/cloudtrail.ts`.

## Dashboard

- `/` is **Needs attention**: hero = **danger count** (warn shown as `+N watch` chip); exception list (cap 15) holds only action rows — GitHub live/failed and Fly degraded/down. Secrets hygiene (unrotated/stale) is a separate compact strip below the list, never in the queue or hero total.
- Rows deep-link to records: GitHub → `/github/runs?repo=&branch=`, Fly → `/fly/overview?app=` (overview highlights + scrolls to the focused app). Hygiene chips → `/secrets?filter=no-rotation|stale`.
- Errored platform slices dim their tile, show a "X unavailable — totals cover N of 3 platforms" banner; hero counts only loaded platforms. 90s auto-refresh for AWS/Fly slices (GitHub has its own smart polling), paused when the tab is hidden.
- Builders: [`lib/dashboard/exceptions.ts`](lib/dashboard/exceptions.ts) (`mergeExceptions` returns `total/dangerCount/warnCount`; no hygiene rows). Tests: [`lib/dashboard/exceptions.test.ts`](lib/dashboard/exceptions.test.ts). Redirects: [`lib/dashboard/legacy-redirect.ts`](lib/dashboard/legacy-redirect.ts).
- `/aws` → `/`. `/github/overview` → `/github`. AWS sidebar header is expand-only.
- URL filters: home `?source=github|secrets|fly`; secrets chips/insight tiles and `?mode=values` sync `filter` in the URL.
- GitHub data fetches once on home; live polling only under `/github` (`GitHubDataProvider` smart polling). Home is no longer a tool directory.
- Composition methodology: [`.cursor/skills/dashboard-design/`](.cursor/skills/dashboard-design/).

## Secrets UI

- List, search, detail, bulk edit, value editor — uses `useData()` for secrets list.
- Secret detail page (`app/secrets/[id]/page.tsx`): **Details** panel shows full resource ARN (from list metadata or loaded value) with **Copy ARN**.
- `/secrets` is browse + insights tiles/triage + `?mode=values` value search. `/secrets/overview` and `/secrets/search` redirect.
- `/secrets/[id]` detail unchanged.

## Amplify UI

- [`app/amplify/page.tsx`](app/amplify/page.tsx): lists Gen 1 Amplify apps in the workspace region/profile; env search lives in `?mode=search` on the same page (`/amplify/search` redirects there).
- [`app/amplify/[appId]/page.tsx`](app/amplify/[appId]/page.tsx): app detail with branches; edit app-level and per-branch environment variables (`components/amplify/env-vars-editor.tsx`, bulk modal).
- [`app/amplify/search/page.tsx`](app/amplify/search/page.tsx): legacy redirect to `/amplify?mode=search` (query forwarded).

## IAM UI

- [`app/iam/page.tsx`](app/iam/page.tsx): module overview with cards for cross-account copy and create-user.
- [`app/iam/cross-account-copy/page.tsx`](app/iam/cross-account-copy/page.tsx): search (type toggles), target profile select, copy with overwrite dialog when entity exists in target account.
- [`app/iam/create-user/page.tsx`](app/iam/create-user/page.tsx): form with username input + template user dropdown (populated via `/api/iam/users`), optional group membership, confirmation dialog, success panel showing sign-in URL/credentials with copy buttons.

## VPC UI

- **Read-only.** No AWS writes anywhere in the VPC module (no PATCH route, no Modify*/CreateTags calls).
- `/vpc` lists VPCs; `/vpc/[vpcId]?view=topology|resources|load-balancers|subnets|routing|security|connectivity|planner|review`. Extra params: `select` (topology subnet), `subnet` (resources filter), `from` (route tester source), `focus` (security group), `lb` (expanded load balancer ARN), `res` (details drawer, any view).
- **Breadcrumbs**: pages can override the top-bar breadcrumb with `useBreadcrumbs([...])` from [`lib/nav/breadcrumb-context.tsx`](lib/nav/breadcrumb-context.tsx) (provider in `Shell`); items with `href` render as links. VPC detail uses `VPC / <name> / <view>`.
- **Tiers**: public = default route to `igw-*`; private = default route elsewhere (NAT, TGW…); isolated = no default route. Effective route table = explicit association else main.
- **Services**: ELBv2, RDS (also DocumentDB/Neptune instances), Lambda, ElastiCache and ECS come from their own APIs; `coverage` says which answered. When one is unreadable, its ENI-derived rows appear marked "inferred". Lambda is cached in-process (10 min SWR) because `ListFunctions` pages 50 at a time; a cold miss returns `pending` and the provider re-polls after 6 s.
- **Review** is heuristic (open SG ports, default SG in use, flow logs, single AZ, NAT per AZ, subnet exhaustion, endpoint DNS, S3 gateway endpoint, blackholes, unused RTs/SGs/ENIs, CIDR overlap, peering state, plain-HTTP internet ALBs, target health, public/unencrypted/single-AZ RDS, cache TLS, ECS running < desired, single-AZ Lambda). Score = 100 − 15/7/3 per high/medium/low; repeats of one per-resource rule add 25% each, capped at 2×.
- IAM (read-only): `ec2:Describe*`, `elasticloadbalancing:Describe*`, `rds:DescribeDBInstances`, `lambda:ListFunctions`, `elasticache:DescribeCacheClusters`/`DescribeCacheSubnetGroups`, `ecs:ListClusters`/`ListServices`/`DescribeServices`. Missing ones surface in the warnings banner.
- Motion classes `.vpc-flow`, `.vpc-pop`, `.vpc-slide`, `.vpc-confetti` live in `app/globals.css` and stop under `prefers-reduced-motion`.

## Route 53 / Fly domains

- [`lib/domains/types.ts`](lib/domains/types.ts) — client-safe DTOs for hosted zones, DNS change preview/apply.
- [`lib/domains/fly-route53.ts`](lib/domains/fly-route53.ts) — Fly `checkCert` → Route 53 diff, SHA-256 `changesHash`, apply with hash validation.
- [`lib/fly/certs.ts`](lib/fly/certs.ts) — cert status mapping + defensive DNS instruction parse from flyctl JSON.
- [`lib/aws/route53.ts`](lib/aws/route53.ts) — `@aws-sdk/client-route-53` list zones, longest-suffix match (public + private), record changes.
- [`app/route53/page.tsx`](app/route53/page.tsx) — minimal AWS Route 53 hub.
- [`app/route53/fly-domains/page.tsx`](app/route53/fly-domains/page.tsx) — table of Fly apps with pending/failed cert highlight; preview/apply modal.
- API: `GET /api/fly/domains`, `GET /api/fly/apps/[app]/certs/[hostname]`, `GET /api/route53/hosted-zones`, `POST /api/route53/fly-domains/preview`, `POST /api/route53/fly-domains/apply`.
- Plan pack: [`docs/plans/fly-route53-domains/`](docs/plans/fly-route53-domains/).

## Azure runner page

- `/github/runner` (nav: GitHub → Runner) shows the self-hosted runner `github-runner-001` (enterprise `gushwork-ai`) on the Azure VM. Runner listener runs under **pm2** (`run-sh`), not systemd — the `actions.runner.*` unit is installed but inactive.
- One SSH call per refresh runs [`remote-script.ts`](lib/runner/remote-script.ts) (python3, read-only): `ps` for `Runner.Listener` / `Runner.Worker` (worker present = busy), `pm2 jlist`, `/proc`, `~/actions-runner/_diag/Runner_*.log` event lines (`Running job` / `completed with result`) and each `Worker_*.log` job message (`github` context → repo, workflow, run id, event, ref, actor). [`parse.ts`](lib/runner/parse.ts) joins them by plan id.
- History only covers what the runner still keeps in `_diag` (it prunes old logs) — the page shows the oldest retained job.
- Config precedence: **Settings → Runner VM** (host/user saved server-side in `~/.flightdeck/runner-vm.json`, override dir with `FLIGHTDECK_CONFIG_DIR`) > `RUNNER_VM_HOST` / `RUNNER_VM_USER` in env or gitignored `.env.azure` (read from the process cwd — Next does not auto-load it) > user default `azureuser`. Host has no default. The password (`VM_PASSWORD` / `RUNNER_VM_PASSWORD`) is env-only and never saved or returned by the API. Host/user are regex-validated before reaching ssh argv. Settings has a "Save & test connection" button (`components/settings/runner-vm-settings.tsx`). Password reaches `ssh` only via `SSH_ASKPASS` env — never argv or disk. Requires an `ssh` binary on the host (not in the Docker image; POSIX only, askpass helper is a `sh` script).

## Gotchas

- **CI runners / Node**: Ubuntu jobs in `.github/workflows/ci.yml` and `release.yml` (`docker`, `electron-linux`) use `runs-on: [self-hosted, ubuntu-latest]` — the runner must have both labels. `electron-macos` and `electron-windows` stay on `macos-latest` and `windows-latest`. Actions and the Dockerfile use Node 26 (`node:26-bookworm-slim`).
- **Profile dropdown hydration**: Saved profile names from `localStorage` are applied after mount so SSR and the first client render match; the list briefly shows env-only options until the transition runs.
- **Postgres cache**: If `DATABASE_URL` is unset or the DB is unreachable, listing secrets still works; caching is best-effort. Ensure `DATABASE_URL` and network access if you rely on cache for hot paths.
- **IAM copy**: Target profile must be a named profile (not default chain). Add profiles via Settings / `NEXT_PUBLIC_AWS_PROFILES` / `aws-saved-profiles` in localStorage.
- **IAM search**: Roles, users, and policies use **separate** match limits so heavy role results do not hide policies. Policy search uses `GetPolicy` for full ARNs, root policy names, and `path/name` forms before paginating `ListPolicies` (customer-managed / `Local` only). **Customer inline** policies are discovered by scanning roles/users with `ListRolePolicies` / `ListUserPolicies` (capped). Copying inline source creates a **customer-managed** policy of the same name on the target. Large accounts may still hit pagination caps; UI shows a truncated hint.
- **Trust policies**: Heuristic account-ID substitution may not suit every cross-account trust pattern; review in AWS after copy.
