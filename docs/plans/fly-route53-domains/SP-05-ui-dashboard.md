# SP-05: UI dashboard

## Type
Parallel

## Blocked by
- SP-04 (preview/apply routes must exist — no stubs)

## Goal
Ship `/route53/fly-domains` inventory table with sticky filters, row highlighting for pending/failed certs, and preview-then-apply modal; minimal `/route53` hub for nav parent.

## Owns
- `app/route53/page.tsx` — minimal hub (hero + link card to Fly domains)
- `app/route53/fly-domains/page.tsx`
- `components/route53/fly-domains-dashboard.tsx`
- `components/route53/domain-preview-modal.tsx`

## Provides
- Rendered pages at `/route53` and `/route53/fly-domains`
- Client components fetching live APIs only (no `lib/fly/cli`, no `lib/aws/*`)

## Consumes
| From | Contract | Until merged, use |
|------|----------|-------------------|
| SP-02 | `GET /api/fly/domains`, detail route | live API |
| SP-03 | `GET /api/route53/hosted-zones` | live API |
| SP-04 | POST preview/apply | live API |
| SP-01 | DTO types | `lib/fly/types.ts`, `lib/domains/types.ts` (type-only imports) |
| existing | AWS workspace | `lib/context/aws-workspace-provider.tsx`, `workspaceSearchParams` |

## Out of scope
- Nav registry, sidebar, shell (SP-06)
- API route implementations

## Implementation notes
- **Layout:** sortable table + sticky filter bar (pattern: `app/github/runs/page.tsx`).
- **Filters:** All / Needs attention / Verified (URL-synced via `useSearchParams`).
- **Stat ribbon:** total apps · verified custom domains · needs attention count.
- **Row highlight:** `needsAttention` → warn border/background.
- **Badges:** pending = warn; failed = danger; ready = success.
- **Expand row:** pending/failed hostnames + "Configure in Route 53" → opens preview modal.
- **Preview modal:** hosted zone dropdown (auto-select from preview response, allow override → re-preview); diff table; warnings; confirm via `ConfirmDialog`; destructive confirm when UPSERT overwrites.
- **Hub page:** short hero + single link card to Fly domains (not full overview-directory layout).
- Follow design anti-patterns rule (`rounded-xl`, tokens, focus rings).
- `"use client"` components must not import server-only libs.

## Done when
- [ ] Table loads apps from `/api/fly/domains`; filters work
- [ ] Pending/failed rows visually distinct; badge colors correct
- [ ] Preview modal shows diff; apply succeeds with hash from preview
- [ ] `/route53` hub renders link to tool
- [ ] `npx tsc --noEmit` passes
- [ ] No edits outside **Owns**

## Agent spawn brief
Build UI per `docs/plans/fly-route53-domains/contracts.md` and grilling decisions. Create minimal `/route53` hub and `/route53/fly-domains` dashboard: table + sticky filters, stat ribbon, expand rows, preview modal with hosted zone override and hash-based apply. Import types only from lib/fly/types and lib/domains/types. Use AWS workspace context for profile/region. Do not edit registry, sidebar, or API routes.
