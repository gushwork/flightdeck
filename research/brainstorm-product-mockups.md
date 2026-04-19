# Product Brainstorm: Rough UI Mockups & Flow

**Date:** 2026-04-12
**Status:** Brainstorm / exploration — nothing is decided

---

## Product Shape: Web App with Embedded Agent

A web dashboard with an always-available AI agent sidebar.
The left side is structured UI (browse, search, inspect).
The right side is a conversational agent that can read what you're looking at and act on it.

---

## Screen 1: Home Dashboard

The first thing you see. Answers: "What's the state of my AWS IAM and Secrets?"

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ☁ AWS Manager                                    us-east-1 ▼  │ ppunit  │ ⚙   │
├────────────┬─────────────────────────────────────────────────────┬───────────────┤
│            │                                                     │               │
│  NAVIGATE  │  IAM Overview                     Secrets Overview  │  🤖 Agent     │
│            │  ┌──────────┬──────────┬─────────┐ ┌──────────────┐ │               │
│  Dashboard │  │ 23 Users │ 8 Groups │ 47 Roles│ │ 156 Secrets  │ │  How can I    │
│            │  │ 5 idle ⚠ │          │ 12 idle │ │ 23 no rotate │ │  help?        │
│  ─────────  │  └──────────┴──────────┴─────────┘ │ 4 stale  ⚠  │ │               │
│  IAM       │                                     └──────────────┘ │  Try:         │
│   Users    │  ┌─ Health Score ──────────────────────────────────┐ │  "Who has     │
│   Groups   │  │                                                 │ │   admin       │
│   Roles    │  │  IAM Hygiene     ████████████░░░░  72/100       │ │   access?"    │
│   Policies │  │  MFA Coverage    ████████████████░  91%         │ │               │
│            │  │  Key Rotation    ██████░░░░░░░░░░  38% ⚠       │ │  "List stale  │
│  ─────────  │  │  Unused Perms    ██████████░░░░░░  62 findings │ │   secrets"    │
│  Secrets   │  │  Secret Rotation ████████████░░░░  78%         │ │               │
│   Browse   │  │                                                 │ │  "Offboard    │
│   Search   │  └─────────────────────────────────────────────────┘ │   user jake"  │
│            │                                                     │               │
│  ─────────  │  ┌─ Recent Activity ─────────────────────────────┐ │ ──────────────│
│  Audit     │  │  10m ago  sarah attached PowerUserAccess       │ │               │
│  Access    │  │  2h ago   role/deploy-lambda last assumed      │ │  [  Ask...  ] │
│  Analyzer  │  │  1d ago   secret prod/db/creds rotated         │ │               │
│            │  │  3d ago   user jake password last used         │ │               │
│            │  └─────────────────────────────────────────────────┘ │               │
└────────────┴─────────────────────────────────────────────────────┴───────────────┘
```

---

## Screen 2: IAM Users List

Structured browse + search across all users. Every column is sortable/filterable.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ☁ AWS Manager  › IAM › Users                                                   │
├────────────┬─────────────────────────────────────────────────────┬───────────────┤
│            │                                                     │               │
│  NAVIGATE  │  🔍 Search users, groups, policies...               │  🤖 Agent     │
│            │  ┌─────────────────────────────────────────────────┐ │               │
│  Dashboard │  │ Filter: All ▼ │ Group: Any ▼ │ Status: Any ▼  │ │  You're       │
│            │  └─────────────────────────────────────────────────┘ │  viewing 23   │
│  ─────────  │                                                     │  IAM users.   │
│  IAM       │  ┌─────────────────────────────────────────────────┐ │               │
│  ▸ Users ◂ │  │ ☐ │ Name      │ Groups    │ Policies│ Last     │ │  5 haven't    │
│   Groups   │  │   │           │           │ (eff.)  │ Active   │ │  logged in    │
│   Roles    │  ├───┼───────────┼───────────┼─────────┼──────────┤ │  for >90d.    │
│   Policies │  │ ☐ │ sarah     │ Devs,     │ 14      │ 2h ago   │ │               │
│            │  │   │           │ Backend   │         │          │ │  3 have       │
│            │  │ ☐ │ jake      │ DevOps    │ 22      │ 94d ago⚠│ │  Admin-       │
│            │  │   │           │           │         │          │ │  Access ⚠     │
│            │  │ ☐ │ priya     │ Admins    │ 31 ⚠   │ 1h ago   │ │               │
│            │  │   │           │           │         │          │ │  Want me to   │
│            │  │ ☐ │ mike      │ ReadOnly  │ 4       │ 12d ago  │ │  analyze any  │
│            │  │   │           │           │         │          │ │  user?        │
│            │  │ ☐ │ deploy-ci │ —         │ 8       │ 30m ago  │ │               │
│            │  │   │ (svc acc) │           │         │          │ │               │
│            │  └─────────────────────────────────────────────────┘ │               │
│            │                                                     │               │
│            │  ☐ Select all  │  With selected: [Actions ▼]       │  [  Ask...  ] │
└────────────┴─────────────────────────────────────────────────────┴───────────────┘
```

---

## Screen 3: User Detail — Permission Map

Click on a user → see their full permission chain. This is the "comprehension" view.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ☁ AWS Manager  › IAM › Users › sarah                                            │
├────────────┬─────────────────────────────────────────────────────┬───────────────┤
│            │                                                     │               │
│  NAVIGATE  │  sarah                               [Edit] [More] │  🤖 Agent     │
│            │  Created: 2025-03-14 │ Last active: 2h ago         │               │
│            │  MFA: ✅ │ Access Keys: 1 (rotated 12d ago)        │  sarah has    │
│            │  Tags: Env=dev, Project=app-api, Team=backend      │  14 effective │
│            │                                                     │  policies.    │
│            │  ┌─ Permission Chain ──────────────────────────────┐ │               │
│            │  │                                                 │ │  6 unused     │
│            │  │  sarah ─┬─▸ Group: Developers                  │ │  permissions  │
│            │  │         │    ├─ S3-ABAC-ReadWrite               │ │  detected by  │
│            │  │         │    ├─ Lambda-ABAC-Deploy              │ │  Access       │
│            │  │         │    └─ EC2-ABAC-Dev                    │ │  Analyzer:    │
│            │  │         │                                       │ │  • sqs:*      │
│            │  │         ├─▸ Group: Backend                      │ │  • sns:*      │
│            │  │         │    ├─ DynamoDB-ABAC-ReadWrite         │ │  • rds:Delete*│
│            │  │         │    └─ SQS-ABAC-ReadWrite              │ │               │
│            │  │         │                                       │ │  Want me to   │
│            │  │         └─▸ Direct policies (1)                 │ │  generate a   │
│            │  │              └─ SecretsRead-DevAppApi           │ │  tighter      │
│            │  │                                                 │ │  policy?      │
│            │  │  Boundary: DeveloperBoundary (caps iam:*, org:*)│ │               │
│            │  └─────────────────────────────────────────────────┘ │  [ Yes ]      │
│            │                                                     │  [ Show JSON ] │
│            │  ┌─ Effective Permissions Summary ─────────────────┐ │               │
│            │  │  S3        read, write   (dev/app-api/* only)   │ │               │
│            │  │  Lambda    invoke, deploy (dev only)            │ │               │
│            │  │  EC2       start, stop    (dev only)            │ │               │
│            │  │  DynamoDB  read, write    (dev/app-api only)    │ │               │
│            │  │  SQS       read, write    (dev/app-api only) ⚠ │ │               │
│            │  │  Secrets   read           (dev/app-api/*)       │ │               │
│            │  └─────────────────────────────────────────────────┘ │               │
│            │                                                     │  [  Ask...  ] │
└────────────┴─────────────────────────────────────────────────────┴───────────────┘
```

---

## Screen 4: Agent Interaction — Generate Policy Change

User clicks "Yes" to tighten permissions, or types a request. Agent responds with actionable output.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ☁ AWS Manager  › IAM › Users › sarah                                            │
├────────────┬─────────────────────────────────────────────────────┬───────────────┤
│            │                                                     │               │
│  (same     │  (User detail stays visible)                        │  🤖 Agent     │
│   left     │                                                     │               │
│   nav)     │                                                     │  You asked:   │
│            │                                                     │  "Tighten     │
│            │                                                     │   sarah's     │
│            │                                                     │   permissions"│
│            │                                                     │               │
│            │                                                     │  Based on     │
│            │                                                     │  Access       │
│            │                                                     │  Analyzer     │
│            │                                                     │  (90d window):│
│            │                                                     │               │
│            │                                                     │  sarah never  │
│            │                                                     │  used:        │
│            │                                                     │  • sqs:Send*  │
│            │                                                     │  • sqs:Purge* │
│            │                                                     │  • sns:*      │
│            │                                                     │  • rds:Delete*│
│            │                                                     │               │
│            │                                                     │  Recommended: │
│            │                                                     │  Remove sarah │
│            │                                                     │  from group   │
│            │                                                     │  "Backend"    │
│            │                                                     │  (grants SQS/ │
│            │                                                     │  SNS) and     │
│            │                                                     │  create a     │
│            │                                                     │  scoped       │
│            │                                                     │  DynamoDB-    │
│            │                                                     │  only policy. │
│            │                                                     │               │
│            │                                                     │  ┌──────────┐ │
│            │                                                     │  │ View JSON │ │
│            │                                                     │  │ Apply     │ │
│            │                                                     │  │ Copy CLI  │ │
│            │                                                     │  └──────────┘ │
│            │                                                     │               │
│            │                                                     │  [  Ask...  ] │
└────────────┴─────────────────────────────────────────────────────┴───────────────┘
```

---

## Screen 5: Secrets Browser

List view with server-side + client-side search. The "search values" toggle is the unique feature.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ☁ AWS Manager  › Secrets                                                        │
├────────────┬─────────────────────────────────────────────────────┬───────────────┤
│            │                                                     │               │
│  NAVIGATE  │  🔍 Search secrets...          [☐ Search values]   │  🤖 Agent     │
│            │  ┌─────────────────────────────────────────────────┐ │               │
│  Dashboard │  │ Env: All ▼ │ Type: All ▼ │ Rotation: All ▼   │ │  156 secrets  │
│            │  └─────────────────────────────────────────────────┘ │  in us-east-1 │
│  ─────────  │                                                     │               │
│  IAM       │  ┌─────────────────────────────────────────────────┐ │  23 have no   │
│            │  │ ☐ │ Name              │ Env  │ Type  │ Rotated │ │  auto-rotate  │
│  ─────────  │  ├───┼───────────────────┼──────┼───────┼─────────┤ │  configured.  │
│  Secrets   │  │ ☐ │ dev/app-api/      │ dev  │ db    │ 12d ago │ │               │
│  ▸Browse◂  │  │   │  database/primary │      │       │         │ │  4 not        │
│   Search   │  │ ☐ │ dev/app-api/      │ dev  │ api   │ —  ⚠   │ │  accessed in  │
│            │  │   │  api-key/stripe   │      │       │         │ │  6+ months.   │
│  ─────────  │  │ ☐ │ staging/app-web/  │ stg  │ db    │ 8d ago  │ │               │
│  Audit     │  │   │  database/primary │      │       │         │ │               │
│            │  │ ☐ │ prod/app-api/     │ prod │ db    │ 2d ago  │ │               │
│            │  │   │  database/primary │      │       │         │ │               │
│            │  │ ☐ │ prod/app-api/     │ prod │ api   │ 30d ago │ │               │
│            │  │   │  api-key/openai   │      │       │         │ │               │
│            │  │ ☐ │ shared/infra/     │ —    │ cert  │ 60d ago │ │               │
│            │  │   │  certificate/tls  │      │       │         │ │               │
│            │  └─────────────────────────────────────────────────┘ │               │
│            │                                                     │               │
│            │  ☐ Select all │ With selected: [Actions ▼]         │  [  Ask...  ] │
│            │                  ├─ Edit values                     │               │
│            │                  ├─ Bulk tag                        │               │
│            │                  ├─ Enable rotation                 │               │
│            │                  └─ Delete                          │               │
└────────────┴─────────────────────────────────────────────────────┴───────────────┘
```

---

## Screen 6: Secrets Global Search (with Value Search)

The killer feature. User enables "Search values", tool fetches + indexes all values, then searches.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ☁ AWS Manager  › Secrets › Search                                               │
├────────────┬─────────────────────────────────────────────────────┬───────────────┤
│            │                                                     │               │
│  NAVIGATE  │  🔍  rds.amazonaws.com        [☑ Search values]    │  🤖 Agent     │
│            │                                                     │               │
│            │  ⚠ Value search: fetched 156 secrets (0.8s)        │  Found 12     │
│            │    Values are in-memory only. Will clear on exit.   │  secrets with │
│            │                                                     │  "rds.amazon" │
│            │  ┌─ 12 results ────────────────────────────────────┐ │  in their     │
│            │  │                                                  │ │  values.      │
│            │  │ ☐ dev/app-api/database/primary                  │ │               │
│            │  │   ┌─ matched in value ────────────────────────┐ │ │  These are    │
│            │  │   │ "host": "dev-db.abc123.us-east-1.         │ │  all database  │
│            │  │   │          ▶rds.amazonaws.com◀"              │ │  connection   │
│            │  │   └──────────────────────────────────────────┘ │ │  secrets.     │
│            │  │                                                  │ │               │
│            │  │ ☐ staging/app-api/database/primary              │ │  4 point to   │
│            │  │   ┌─ matched in value ────────────────────────┐ │ │  the OLD db   │
│            │  │   │ "host": "stg-db.xyz789.us-east-1.         │ │  host that     │
│            │  │   │          ▶rds.amazonaws.com◀"              │ │  was migrated. │
│            │  │   └──────────────────────────────────────────┘ │ │               │
│            │  │                                                  │ │  Want me to   │
│            │  │ ☐ prod/app-api/database/primary                 │ │  help update  │
│            │  │   ┌─ matched in value ────────────────────────┐ │ │  them?        │
│            │  │   │ "host": "prod-db.def456.us-east-1.        │ │               │
│            │  │   │          ▶rds.amazonaws.com◀"              │ │               │
│            │  │   └──────────────────────────────────────────┘ │ │               │
│            │  │                                                  │ │               │
│            │  │ ... 9 more results                              │ │               │
│            │  └─────────────────────────────────────────────────┘ │               │
│            │                                                     │               │
│            │  ☐ Select all │ [Bulk Edit Selected]               │  [  Ask...  ] │
└────────────┴─────────────────────────────────────────────────────┴───────────────┘
```

---

## Screen 7: Bulk Edit — Search & Replace in Secret Values

After selecting secrets from search, user can find/replace across all selected values.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ☁ AWS Manager  › Secrets › Search › Bulk Edit                                   │
├────────────┬─────────────────────────────────────────────────────┬───────────────┤
│            │                                                     │               │
│            │  Bulk Edit — 4 secrets selected                     │  🤖 Agent     │
│            │                                                     │               │
│            │  Mode: [Find & Replace ▼]                           │  Previewing   │
│            │                                                     │  changes to   │
│            │  Find:    [ old-db.abc123.us-east-1.rds.amazo... ] │  4 secrets.   │
│            │  Replace: [ new-db.xyz789.us-east-1.rds.amazo... ] │               │
│            │                                                     │  ⚠ This will  │
│            │  ┌─ Preview Changes ───────────────────────────────┐ │  create new   │
│            │  │                                                  │ │  versions.    │
│            │  │  1. dev/app-api/database/primary                │ │  Previous     │
│            │  │     "host":                                     │ │  versions     │
│            │  │     - "old-db.abc123.us-east-1.rds.amazonaws"   │ │  are kept as  │
│            │  │     + "new-db.xyz789.us-east-1.rds.amazonaws"   │ │  AWSPREVIOUS  │
│            │  │                                                  │ │  (rollback    │
│            │  │  2. dev/app-web/database/primary                │ │  available).  │
│            │  │     "host":                                     │ │               │
│            │  │     - "old-db.abc123.us-east-1.rds.amazonaws"   │ │               │
│            │  │     + "new-db.xyz789.us-east-1.rds.amazonaws"   │ │               │
│            │  │                                                  │ │               │
│            │  │  3. staging/app-api/database/primary            │ │               │
│            │  │     "host":                                     │ │               │
│            │  │     - "old-db.abc123.us-east-1.rds.amazonaws"   │ │               │
│            │  │     + "new-db.xyz789.us-east-1.rds.amazonaws"   │ │               │
│            │  │                                                  │ │               │
│            │  │  4. staging/app-web/database/primary            │ │               │
│            │  │     (same change)                               │ │               │
│            │  └─────────────────────────────────────────────────┘ │               │
│            │                                                     │               │
│            │    [ Cancel ]              [ ⚠ Apply 4 changes ]   │               │
│            │                                                     │  [  Ask...  ] │
└────────────┴─────────────────────────────────────────────────────┴───────────────┘
```

---

## Screen 8: Secret Detail — With Access History

Click into a secret → see value, metadata, tags, and who accessed it.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ☁ AWS Manager  › Secrets › prod/app-api/database/primary                        │
├────────────┬─────────────────────────────────────────────────────┬───────────────┤
│            │                                                     │               │
│            │  prod/app-api/database/primary       [Edit] [More] │  🤖 Agent     │
│            │  Created: 2025-01-10 │ Last changed: 2d ago        │               │
│            │  Last accessed: 4h ago │ Rotation: ✅ every 30d    │  This secret  │
│            │                                                     │  was accessed │
│            │  ┌─ Tags ──────────────────────────────────────────┐ │  47 times in  │
│            │  │ Environment=prod  Project=app-api  Type=db     │ │  the last     │
│            │  │ Owner=team-backend  RotationEnabled=true        │ │  90 days.     │
│            │  └─────────────────────────────────────────────────┘ │               │
│            │                                                     │  Top          │
│            │  ┌─ Value (JSON) ──────────────── [Show] [Copy] ──┐ │  consumers:   │
│            │  │  {                                              │ │  • role/      │
│            │  │    "engine": "postgres",                        │ │    app-api-   │
│            │  │    "host": "prod-db.def456.us-east-1.rds...",  │ │    lambda     │
│            │  │    "port": 5432,                                │ │    (38x)      │
│            │  │    "username": "app_user",                      │ │  • user/      │
│            │  │    "password": "••••••••••••••••"  [Reveal]     │ │    sarah      │
│            │  │    "dbname": "production"                       │ │    (6x)       │
│            │  │  }                                              │ │  • role/      │
│            │  └─────────────────────────────────────────────────┘ │    ecs-task   │
│            │                                                     │    (3x)       │
│            │  [Value] [Versions] [▸Access History◂] [Rotation]  │               │
│            │                                                     │               │
│            │  ┌─ Access History (last 90d, via CloudTrail) ────┐ │  sarah last   │
│            │  │                                                 │ │  accessed     │
│            │  │  4h ago  │ role/app-api-lambda   │ 10.0.1.5    │ │  from her     │
│            │  │  4h ago  │ role/app-api-lambda   │ 10.0.1.6    │ │  office IP.   │
│            │  │  1d ago  │ user/sarah            │ 203.0.113.1 │ │               │
│            │  │  1d ago  │ role/app-api-lambda   │ 10.0.1.5    │ │  No unusual   │
│            │  │  3d ago  │ role/ecs-task-prod    │ 10.0.2.10   │ │  access       │
│            │  │  7d ago  │ user/sarah            │ 203.0.113.1 │ │  patterns     │
│            │  │  ...     │ (47 total events)     │             │ │  detected.    │
│            │  └─────────────────────────────────────────────────┘ │               │
│            │                                                     │  [  Ask...  ] │
└────────────┴─────────────────────────────────────────────────────┴───────────────┘
```

---

## Screen 9: Access Analyzer View

Dedicated view for Access Analyzer findings — the "who uses what" exploration.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ☁ AWS Manager  › Access Analyzer                                                │
├────────────┬─────────────────────────────────────────────────────┬───────────────┤
│            │                                                     │               │
│  NAVIGATE  │  Access Analyzer                  Analyzer: ✅ Active│  🤖 Agent     │
│            │  Tracking period: 90 days                           │               │
│            │                                                     │  62 active    │
│  ─────────  │  ┌─ Finding Summary ──────────────────────────────┐ │  findings.    │
│  Audit     │  │                                                 │ │               │
│  ▸Analyzer◂│  │  Unused Permissions     42  ████████████████░░ │ │  Top          │
│            │  │  Unused Roles           12  █████░░░░░░░░░░░░░ │ │  offenders:   │
│            │  │  Unused Access Keys      5  ██░░░░░░░░░░░░░░░░ │ │  • jake       │
│            │  │  Unused Passwords        3  █░░░░░░░░░░░░░░░░░ │ │    (14 unused │
│            │  │                                                 │ │    perms)     │
│            │  └─────────────────────────────────────────────────┘ │  • role/      │
│            │                                                     │    legacy-    │
│            │  ┌─ Findings ─────────────────────────────────────┐ │    worker     │
│            │  │ Filter: [Type ▼] [Entity ▼] [Service ▼]       │ │    (never     │
│            │  │                                                 │ │    assumed)   │
│            │  │ Entity          │ Type        │ Service  │ Age │ │               │
│            │  ├─────────────────┼─────────────┼──────────┼─────┤ │  Want me to   │
│            │  │ user/jake       │ UnusedPerm  │ s3       │ 94d│ │  generate a   │
│            │  │ user/jake       │ UnusedPerm  │ ec2      │ 94d│ │  cleanup      │
│            │  │ user/jake       │ UnusedPerm  │ rds      │ 94d│ │  plan?        │
│            │  │ role/legacy-wkr │ UnusedRole  │ —        │120d│ │               │
│            │  │ role/old-deploy │ UnusedRole  │ —        │200d│ │  [ Yes ]      │
│            │  │ user/mike       │ UnusedPerm  │ lambda   │ 45d│ │  [ Show all ] │
│            │  │ ...             │             │          │    │ │               │
│            │  └─────────────────────────────────────────────────┘ │               │
│            │                                                     │               │
│            │  ☐ Select all │ [Generate Remediation ▼]           │  [  Ask...  ] │
└────────────┴─────────────────────────────────────────────────────┴───────────────┘
```

---

## Key Flow Diagrams

### Flow 1: Search → Select → Modify Secrets

```
User types search query
        │
        ▼
  ┌─ "Search values" toggle OFF? ─┐
  │                                │
  │ Yes                            │ No
  ▼                                ▼
Server-side filter             Fetch all secret values
(name/desc/tags only)          (in-memory, ~1 sec)
  │                                │
  └────────────┬───────────────────┘
               ▼
       Show results with
       matched context highlighted
               │
               ▼
       User selects 1+ results
               │
               ▼
       Choose action:
       ├─ Find & Replace (across values)
       ├─ Edit individually
       ├─ Bulk tag
       ├─ Enable rotation
       └─ Delete
               │
               ▼
       Preview diff / changes
               │
               ▼
       User confirms ──▸ Apply via API
                        (each secret versioned;
                         rollback via AWSPREVIOUS)
```

### Flow 2: Agent-Assisted IAM Change

```
User asks: "Give sarah access to prod S3 bucket X"
               │
               ▼
       Agent reads current IAM snapshot
       Agent checks sarah's tags, groups, existing policies
               │
               ▼
       Agent identifies approach:
       ├─ Option A: Add sarah to a group that already has access
       ├─ Option B: Create new scoped policy + attach
       └─ Option C: Update sarah's tags to match prod scope
               │
               ▼
       Agent presents recommendation + generated policy JSON
               │
               ▼
       User chooses output:
       ├─ "View JSON" → copy-paste and apply manually
       ├─ "Copy CLI" → aws iam commands to run
       └─ "Apply" → agent executes via API (with confirmation)
```

### Flow 3: Access History Lookup

```
User navigates to secret detail
        │
        ▼
  Tool calls CloudTrail LookupEvents
  (filter: secretsmanager.amazonaws.com + secret ARN)
        │
        ▼
  Shows last 90 days of GetSecretValue events:
  - Who (IAM user/role ARN)
  - When (timestamp)
  - From where (IP address)
  - How (user agent)
        │
        ▼
  Agent summarizes: "Accessed 47 times by 3 identities.
  Mostly by the Lambda role. sarah accessed 6 times
  from expected IP. No anomalies."
```
