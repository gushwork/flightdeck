# SP-02: Fly certs API

## Type
Parallel

## Blocked by
- SP-01 (contracts + npm dep available)

## Goal
Expose Fly.io app domain inventory and per-hostname DNS instructions via flyctl, flagging apps with pending/failed custom certs.

## Owns
- `lib/fly/types.ts` — cert-related additions only
- `lib/fly/cli.ts` — `listCerts`, `checkCert`, `getAppsDomainStatus`
- `app/api/fly/domains/route.ts`
- `app/api/fly/apps/[app]/certs/[hostname]/route.ts`
- `lib/fly/certs-status.test.ts` (optional; status mapping unit tests)

## Provides
- Types: `FlyCertStatus`, `FlyCertSummary`, `FlyAppDomainRow`, `FlyCertCheckResult`, `FlyDnsRecordInstruction`
- `GET /api/fly/domains` → `{ apps: FlyAppDomainRow[] }`
- `GET /api/fly/apps/[app]/certs/[hostname]` → `{ cert: FlyCertCheckResult }`
- CLI: `listCerts(app)`, `checkCert(app, hostname)`, `getAppsDomainStatus(apps, concurrency=4)`

## Consumes
| From | Contract | Until merged, use |
|------|----------|-------------------|
| SP-01 | npm dep (none for Fly) | N/A |

## Out of scope
- Route 53 SDK, bridge, preview/apply
- UI, nav, `lib/domains/types.ts`

## Implementation notes
- Follow existing `flyJson` / `listApps` patterns in `lib/fly/cli.ts`.
- Commands: `fly certs list -a <app> -j`, `fly certs check <hostname> -a <app> -j`.
- Map statuses per `contracts.md` table; `needsAttention` only for `pending` | `failed`.
- Apps with zero custom certs: return empty `certs[]`, `needsAttention: false`.
- Parse `checkCert` JSON into `FlyDnsRecordInstruction[]` (name, type, value, optional ttl).
- 401 on Fly auth errors (match `app/api/fly/apps/route.ts`).
- Use bounded concurrency (4) for `getAppsDomainStatus`, same spirit as `getAppsStatus`.

## Done when
- [ ] `GET /api/fly/domains` returns enriched rows with correct `needsAttention`
- [ ] Detail route returns `FlyCertCheckResult` with `dnsRecords`
- [ ] Status mapping covered by unit test(s)
- [ ] `npx tsc --noEmit` passes
- [ ] No edits outside **Owns**

## Agent spawn brief
Implement Fly cert inventory per `docs/plans/fly-route53-domains/contracts.md`. Extend `lib/fly/types.ts` and `lib/fly/cli.ts` with list/check/getAppsDomainStatus. Add GET routes for domain inventory and per-hostname cert check. Map flyctl statuses to ready/pending/failed/unknown. Do not touch Route 53, bridge, UI, or nav. Done when both API routes return typed JSON and tests pass for status mapping.
