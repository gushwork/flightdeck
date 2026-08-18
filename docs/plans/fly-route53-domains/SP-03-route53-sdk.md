# SP-03: Route 53 SDK

## Type
Parallel

## Blocked by
- SP-01 (`lib/domains/types.ts`, SDK installed)

## Goal
List hosted zones and read/write DNS records via AWS SDK, with pure helpers for zone matching (public + private).

## Owns
- `lib/aws/route53.ts`
- `app/api/route53/hosted-zones/route.ts`
- `lib/aws/route53-zone-match.test.ts` (pure helper tests)

## Provides
- `listHostedZones(region, profile)` → `Route53HostedZoneSummary[]`
- `findHostedZoneForDomain(hostname, zones)` → best match or null
- `listResourceRecordSets(hostedZoneId, region, profile, names?)`
- `changeResourceRecordSets(hostedZoneId, changes, region, profile)`
- `GET /api/route53/hosted-zones?region&profile` → `{ zones: Route53HostedZoneSummary[] }`

## Consumes
| From | Contract | Until merged, use |
|------|----------|-------------------|
| SP-01 | `Route53HostedZoneSummary`, `DnsRecordChange` | `lib/domains/types.ts` |
| existing | `awsClientOptions`, `getRegion`, `parseProfileParam` | `lib/aws/client.ts` |

## Out of scope
- Fly CLI, bridge logic, preview/apply routes
- UI, nav, `package.json` (SP-01 added dep)

## Implementation notes
- Mirror `lib/aws/secrets.ts` client pattern.
- Paginate `ListHostedZones` and `ListResourceRecordSets`.
- `findHostedZoneForDomain`: longest suffix match; **include private zones** in auto-match.
- Route 53 is global — region selects API endpoint only.
- API route: `dynamic = 'force-dynamic'`, profile/region query params.

## Done when
- [ ] `GET /api/route53/hosted-zones` returns zones with `privateZone` flag
- [ ] Unit tests for zone matching (public, private, nested subdomain)
- [ ] `changeResourceRecordSets` supports CREATE and UPSERT batches
- [ ] `npx tsc --noEmit` passes
- [ ] No edits outside **Owns**

## Agent spawn brief
Build Route 53 adapter per `docs/plans/fly-route53-domains/contracts.md`. Create `lib/aws/route53.ts` using `@aws-sdk/client-route-53` and `lib/aws/client.ts` credentials. Implement list zones, zone matching (public+private), list records, change records. Add GET hosted-zones API route. Add unit tests for `findHostedZoneForDomain`. Do not touch Fly, bridge, UI, or nav.
