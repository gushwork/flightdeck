# SP-01: Foundation

## Type
Foundation

## Blocked by
None

## Goal
Pin shared contracts and Route 53 bridge DTOs so parallel agents (Fly API, Route 53 SDK) merge without type or dependency conflicts.

## Owns
- `docs/plans/fly-route53-domains/contracts.md` (maintain as API evolves)
- `lib/domains/types.ts` (create)
- `package.json` — add `@aws-sdk/client-route-53` only
- `package-lock.json` (from npm install)

## Provides
- `Route53HostedZoneSummary`, `DnsRecordChange`, `FlyDomainApplyPreview`, `FlyDomainApplyRequest`, `FlyDomainApplyResult`, `DnsRecordAction`
- Documented apply hash algorithm in `contracts.md`
- Route 53 SDK dependency installed

## Consumes
None

## Out of scope
- Fly cert types (`lib/fly/types.ts`) — SP-02
- Any CLI, SDK implementation, API routes, UI, nav

## Implementation notes
- Types must be **client-safe** (no Node imports) — UI imports from `lib/domains/types.ts` directly.
- Run `npm install` after adding dependency.
- Do not add placeholder implementations; export types only.

## Done when
- [ ] `lib/domains/types.ts` exports all shapes in `contracts.md` § lib/domains/types
- [ ] `@aws-sdk/client-route-53` in `package.json` and lockfile updated
- [ ] `contracts.md` complete and matches this sub-plan
- [ ] `npx tsc --noEmit` passes
- [ ] No edits outside **Owns**

## Agent spawn brief
Merge SP-01 first. Create `lib/domains/types.ts` with Route 53 / bridge DTOs exactly as specified in `docs/plans/fly-route53-domains/contracts.md`. Add `@aws-sdk/client-route-53` to `package.json` and run npm install. Do not touch Fly types, CLI, AWS route53 implementation, API routes, or UI. Done when types compile and contracts.md is authoritative.
