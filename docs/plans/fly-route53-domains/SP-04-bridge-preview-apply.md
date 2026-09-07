# SP-04: Bridge preview/apply

## Type
Parallel

## Blocked by
- SP-02 (`checkCert`, `FlyCertCheckResult`)
- SP-03 (`listHostedZones`, `findHostedZoneForDomain`, record read/write)

## Goal
Translate Fly DNS instructions into Route 53 change sets, diff against existing records, and expose preview + hash-validated apply endpoints.

## Owns
- `lib/domains/fly-route53.ts`
- `app/api/route53/fly-domains/preview/route.ts`
- `app/api/route53/fly-domains/apply/route.ts`
- `lib/domains/fly-route53.test.ts`
- `lib/domains/__fixtures__/fly-certs-check-sample.json`

## Provides
- `buildApplyPreview(appName, hostname, opts)` → `FlyDomainApplyPreview`
- `applyPreview(request: FlyDomainApplyRequest)` → `FlyDomainApplyResult`
- `computeChangesHash(changes: DnsRecordChange[])` → hex string
- `POST /api/route53/fly-domains/preview`
- `POST /api/route53/fly-domains/apply`

## Consumes
| From | Contract | Until merged, use |
|------|----------|-------------------|
| SP-01 | Bridge DTOs | `lib/domains/types.ts` |
| SP-02 | `checkCert`, `FlyCertCheckResult` | `lib/fly/cli.ts` |
| SP-03 | Route 53 helpers | `lib/aws/route53.ts` |

## Out of scope
- UI, nav, Fly list route, hosted-zones route implementation changes

## Implementation notes
- Preview flow: `checkCert` → normalize records → auto-match zone via `findHostedZoneForDomain` unless `hostedZoneId` override → fetch existing RRSets → build `DnsRecordChange[]` with CREATE vs UPSERT → warnings on value mismatch.
- TTL: use Fly instruction `ttl` when present, else **300**.
- Record types: A, AAAA, CNAME, TXT (incl. `_fly-ownership`).
- Hash: canonical JSON per `contracts.md`; return `changesHash` in preview.
- Apply: recompute hash from body; **409** on mismatch; do not re-fetch Fly on apply.
- Support A/AAAA/CNAME/TXT in change batches; split multi-value TXT if needed per Route 53 rules.

## Done when
- [ ] POST preview returns diff + warnings + `changesHash` for pending hostname
- [ ] POST apply creates/updates records when hash matches
- [ ] POST apply returns 409 when hash mismatches
- [ ] Parser tests pass against fixture JSON
- [ ] `npx tsc --noEmit` passes
- [ ] No edits outside **Owns**

## Agent spawn brief
Implement Fly→Route53 bridge per `docs/plans/fly-route53-domains/contracts.md`. Create `lib/domains/fly-route53.ts` with preview builder, hash helper, and apply. Wire POST preview and apply routes. Use SP-02 checkCert and SP-03 Route53 helpers. Add fixture + unit tests for DNS parsing and hash stability. Do not build UI or nav.
