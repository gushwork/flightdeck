import {
  Route53Client,
  ListHostedZonesCommand,
  ListResourceRecordSetsCommand,
  ChangeResourceRecordSetsCommand,
  type Change,
  type ResourceRecordSet,
  type ListResourceRecordSetsCommandOutput,
} from "@aws-sdk/client-route-53";
import { awsClientOptions } from "@/lib/aws/client";
import type { DnsRecordChange, Route53HostedZoneSummary } from "@/lib/domains/types";

function getClient(region: string, profile?: string) {
  return new Route53Client(awsClientOptions(region, profile));
}

export async function listHostedZones(
  region: string,
  profile?: string,
): Promise<Route53HostedZoneSummary[]> {
  const client = getClient(region, profile);
  const zones: Route53HostedZoneSummary[] = [];
  let marker: string | undefined;
  do {
    const res = await client.send(new ListHostedZonesCommand({ Marker: marker }));
    for (const z of res.HostedZones ?? []) {
      if (!z.Id || !z.Name) continue;
      zones.push({
        id: z.Id.replace(/^\/hostedzone\//, ""),
        name: z.Name,
        recordCount: z.ResourceRecordSetCount ?? 0,
        privateZone: z.Config?.PrivateZone ?? false,
      });
    }
    marker = res.IsTruncated ? res.NextMarker : undefined;
  } while (marker);
  return zones;
}

/** Longest suffix match; public and private zones both eligible. */
export function findHostedZoneForDomain(
  hostname: string,
  zones: Route53HostedZoneSummary[],
): Route53HostedZoneSummary | null {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  let best: Route53HostedZoneSummary | null = null;
  let bestLen = -1;
  for (const z of zones) {
    const zoneName = z.name.replace(/\.$/, "").toLowerCase();
    if (host === zoneName || host.endsWith(`.${zoneName}`)) {
      if (zoneName.length > bestLen) {
        best = z;
        bestLen = zoneName.length;
      }
    }
  }
  return best;
}

export async function getResourceRecordSet(
  hostedZoneId: string,
  name: string,
  type: string,
  region: string,
  profile?: string,
): Promise<ResourceRecordSet | undefined> {
  const client = getClient(region, profile);
  const fqdn = name.endsWith(".") ? name : `${name.replace(/\.$/, "")}.`;
  const res = await client.send(
    new ListResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      StartRecordName: fqdn,
      StartRecordType: type as ResourceRecordSet["Type"],
      MaxItems: 1,
    }),
  );
  const rr = res.ResourceRecordSets?.[0];
  if (!rr) return undefined;
  const want = name.replace(/\.$/, "").toLowerCase();
  const got = (rr.Name ?? "").replace(/\.$/, "").toLowerCase();
  if (got === want && rr.Type === type) return rr;
  return undefined;
}

export async function listResourceRecordSets(
  hostedZoneId: string,
  region: string,
  profile?: string,
  names?: string[],
): Promise<ResourceRecordSet[]> {
  const client = getClient(region, profile);

  if (names && names.length > 0) {
    const unique = [...new Set(names.map((n) => n.replace(/\.$/, "").toLowerCase()))];
    const sets: ResourceRecordSet[] = [];
    for (const name of unique) {
      const fqdn = `${name}.`;
      let startName: string | undefined = fqdn;
      let startType: string | undefined;
      let done = false;
      while (!done) {
        const res: ListResourceRecordSetsCommandOutput = await client.send(
          new ListResourceRecordSetsCommand({
            HostedZoneId: hostedZoneId,
            StartRecordName: startName,
            StartRecordType: startType as never,
            MaxItems: 50,
          }),
        );
        const batch: ResourceRecordSet[] = res.ResourceRecordSets ?? [];
        if (batch.length === 0) break;
        for (const rr of batch) {
          const n = (rr.Name ?? "").replace(/\.$/, "").toLowerCase();
          if (n === name) sets.push(rr);
          else if (n > name) {
            done = true;
            break;
          }
        }
        if (!res.IsTruncated || done) break;
        const last: ResourceRecordSet | undefined = batch[batch.length - 1];
        startName = last?.Name;
        startType = last?.Type;
      }
    }
    return sets;
  }

  const sets: ResourceRecordSet[] = [];
  let startName: string | undefined;
  let startType: string | undefined;
  let done = false;
  while (!done) {
    const res = await client.send(
      new ListResourceRecordSetsCommand({
        HostedZoneId: hostedZoneId,
        StartRecordName: startName,
        StartRecordType: startType as never,
      }),
    );
    const batch = res.ResourceRecordSets ?? [];
    if (batch.length === 0) break;
    sets.push(...batch);
    if (!res.IsTruncated) {
      done = true;
    } else {
      const last = batch[batch.length - 1];
      startName = last?.Name;
      startType = last?.Type;
    }
  }
  return sets;
}

export async function changeResourceRecordSets(
  hostedZoneId: string,
  changes: DnsRecordChange[],
  region: string,
  profile?: string,
): Promise<{ changeId: string; status: "PENDING" | "INSYNC" }> {
  const client = getClient(region, profile);
  const batch: Change[] = changes.map((c) => ({
    Action: c.action,
    ResourceRecordSet: {
      Name: c.name.endsWith(".") ? c.name : `${c.name}.`,
      Type: c.type as ResourceRecordSet["Type"],
      TTL: c.ttl,
      ResourceRecords: c.values.map((v) => ({ Value: formatRecordValue(c.type, v) })),
    },
  }));
  const res = await client.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      ChangeBatch: { Changes: batch },
    }),
  );
  return {
    changeId: res.ChangeInfo?.Id ?? "",
    status: res.ChangeInfo?.Status === "INSYNC" ? "INSYNC" : "PENDING",
  };
}

function formatRecordValue(type: string, value: string): string {
  if (type === "TXT" && !value.startsWith('"')) return `"${value}"`;
  return value;
}

export function existingValues(rr: ResourceRecordSet | undefined): string[] {
  if (!rr) return [];
  if (rr.AliasTarget?.DNSName) {
    return [`ALIAS → ${rr.AliasTarget.DNSName.replace(/\.$/, "")}`];
  }
  if (!rr.ResourceRecords) return [];
  return rr.ResourceRecords.map((r) => (r.Value ?? "").replace(/^"|"$/g, ""));
}

export function recordSetExists(rr: ResourceRecordSet | undefined): boolean {
  if (!rr) return false;
  if (rr.AliasTarget?.DNSName) return true;
  return (rr.ResourceRecords?.length ?? 0) > 0;
}
