# Contracts: Fly custom domains → Route 53

## Version

`v1` — initial sub-plan pack. Bump when breaking public API shapes.

## Grilling decisions (pinned)

| Topic | Decision |
|-------|------------|
| Route 53 / bridge DTOs | [`lib/domains/types.ts`](../../../lib/domains/types.ts) |
| Fly cert DTOs | [`lib/fly/types.ts`](../../../lib/fly/types.ts) — owned by SP-02 |
| Per-hostname detail route | **In v1** — `GET /api/fly/apps/[app]/certs/[hostname]` |
| Hosted zone auto-match | Longest suffix match; **public and private** zones eligible |
| Apply confirmation | Client resends full `changes[]` + `changesHash`; server recomputes hash and rejects mismatch |
| DNS TTL | From `fly certs check` JSON when present; **default 300** |
| UI layout | Sortable **table** + **sticky filter bar** (GitHub runs pattern) |
| Pending vs failed | Pending = warn badge; failed = danger badge; both set `needsAttention` |
| Nav | Parent **Route 53** → `/route53` (minimal hub); child **Fly domains** → `/route53/fly-domains` |
| UI vs bridge merge | SP-05 starts **after** SP-04 merges (no preview/apply stubs in UI work) |
| `@aws-sdk/client-route-53` | Added in **SP-01 Foundation** (`package.json`) |

## Types

### `lib/fly/types.ts` (SP-02)

```ts
export type FlyCertStatus = "ready" | "pending" | "failed" | "unknown";

export interface FlyCertSummary {
  hostname: string;
  status: FlyCertStatus;
  clientStatus?: string;
  dnsConfigured?: boolean;
}

export interface FlyAppDomainRow {
  appName: string;
  org: string;
  defaultHostname: string;
  certs: FlyCertSummary[];
  needsAttention: boolean;
}

/** Full DNS instructions from fly certs check (detail route + bridge input). */
export interface FlyCertCheckResult {
  hostname: string;
  status: FlyCertStatus;
  clientStatus?: string;
  dnsConfigured?: boolean;
  /** Normalized records Fly expects; TTL may be absent → bridge uses 300. */
  dnsRecords: FlyDnsRecordInstruction[];
}

export interface FlyDnsRecordInstruction {
  name: string;
  type: "A" | "AAAA" | "CNAME" | "TXT";
  value: string;
  ttl?: number;
}
```

**Status mapping** (flyctl → `FlyCertStatus`):

| Raw (case-insensitive contains) | Mapped |
|---------------------------------|--------|
| `ready`, `issued` | `ready` |
| `awaiting`, `pending`, `configur` | `pending` |
| `error`, `failed`, `invalid` | `failed` |
| else | `unknown` |

`needsAttention === true` when any cert has status `pending` or `failed`. Apps with **no custom certs** → `needsAttention: false`.

### `lib/domains/types.ts` (SP-01)

```ts
export interface Route53HostedZoneSummary {
  id: string;
  name: string;
  recordCount: number;
  privateZone: boolean;
}

export type DnsRecordAction = "CREATE" | "UPSERT";

export interface DnsRecordChange {
  name: string;
  type: string;
  ttl: number;
  values: string[];
  action: DnsRecordAction;
}

export interface FlyDomainApplyPreview {
  appName: string;
  hostname: string;
  hostedZoneId: string;
  hostedZoneName: string;
  changes: DnsRecordChange[];
  warnings: string[];
  /** SHA-256 hex of canonical changes JSON — see Apply hash. */
  changesHash: string;
}

export interface FlyDomainApplyRequest {
  appName: string;
  hostname: string;
  hostedZoneId: string;
  region?: string;
  profile?: string;
  changes: DnsRecordChange[];
  changesHash: string;
}

export interface FlyDomainApplyResult {
  changeId: string;
  status: "PENDING" | "INSYNC";
}
```

## Apply hash

Canonical payload for hashing:

```ts
JSON.stringify(changes.map(c => ({
  name: c.name,
  type: c.type,
  ttl: c.ttl,
  values: [...c.values].sort(),
  action: c.action,
})).sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type)))
```

`changesHash = sha256(canonical).hex()`

Preview route computes and returns `changesHash`. Apply route recomputes from body `changes` and returns **409** if mismatch.

## HTTP / RPC

| Method | Path | Request | Response | Owner |
|--------|------|---------|----------|-------|
| GET | `/api/fly/domains` | — | `{ apps: FlyAppDomainRow[] }` | SP-02 |
| GET | `/api/fly/apps/[app]/certs/[hostname]` | — | `{ cert: FlyCertCheckResult }` | SP-02 |
| GET | `/api/route53/hosted-zones` | `?region&profile` | `{ zones: Route53HostedZoneSummary[] }` | SP-03 |
| POST | `/api/route53/fly-domains/preview` | `{ appName, hostname, hostedZoneId?, region?, profile? }` | `{ preview: FlyDomainApplyPreview }` | SP-04 |
| POST | `/api/route53/fly-domains/apply` | `FlyDomainApplyRequest` | `{ result: FlyDomainApplyResult }` | SP-04 |

### Error shapes (all routes)

```ts
{ error: string }
```

| Status | When |
|--------|------|
| 401 | Fly not authenticated (`/api/fly/*`) |
| 404 | App, hostname, or hosted zone not found |
| 409 | `changesHash` mismatch on apply |
| 500 | SDK / flyctl / unexpected |

## Server exports

| Symbol | Module | Owner |
|--------|--------|-------|
| `listCerts`, `checkCert`, `getAppsDomainStatus` | `lib/fly/cli.ts` | SP-02 |
| `listHostedZones`, `findHostedZoneForDomain`, `listResourceRecordSets`, `changeResourceRecordSets` | `lib/aws/route53.ts` | SP-03 |
| `buildApplyPreview`, `applyPreview`, `computeChangesHash` | `lib/domains/fly-route53.ts` | SP-04 |

`findHostedZoneForDomain(hostname, zones)` — strip trailing dots, longest suffix match on zone name; prefer most specific zone.

## File ownership

| Path prefix | Owner |
|-------------|-------|
| `docs/plans/fly-route53-domains/` | Plan pack (this directory) |
| `lib/domains/types.ts` | SP-01 |
| `lib/domains/fly-route53.ts` | SP-04 |
| `lib/domains/*.test.ts`, `lib/domains/__fixtures__/` | SP-04 |
| `lib/fly/types.ts` (cert additions only) | SP-02 |
| `lib/fly/cli.ts` (cert functions) | SP-02 |
| `lib/aws/route53.ts` | SP-03 |
| `lib/aws/route53*.test.ts` | SP-03 |
| `app/api/fly/domains/` | SP-02 |
| `app/api/fly/apps/[app]/certs/` | SP-02 |
| `app/api/route53/hosted-zones/` | SP-03 |
| `app/api/route53/fly-domains/` | SP-04 |
| `app/route53/` | SP-05 |
| `components/route53/` | SP-05 |
| `lib/modules/registry.ts`, `overview-directory.ts`, `lib/nav/`, `components/layout/shell.tsx`, `sidebar.tsx`, `CODEBASE.md` | SP-06 |
| `package.json` (route53 dep only) | SP-01 |

## Stubs (until sibling merges)

SP-03 and SP-04 do **not** run until SP-01 merges. SP-04 consumes real SP-02 + SP-03 implementations (no cross-stubs after Wave 2 start).

SP-05 waits for SP-04; uses live preview/apply routes only.

Fixture for parser tests: `lib/domains/__fixtures__/fly-certs-check-sample.json` (SP-04 creates from captured `fly certs check -j` output).
