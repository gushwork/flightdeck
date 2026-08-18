import { createHash } from "crypto";
import { checkCert } from "@/lib/fly/cli";
import {
  changeResourceRecordSets,
  existingValues,
  findHostedZoneForDomain,
  getResourceRecordSet,
  listHostedZones,
  recordSetExists,
} from "@/lib/aws/route53";
import { getRegion } from "@/lib/aws/client";
import type {
  DnsRecordChange,
  FlyDomainApplyPreview,
  FlyDomainApplyRequest,
  FlyDomainApplyResult,
} from "@/lib/domains/types";
import type { FlyDnsRecordInstruction } from "@/lib/fly/types";

const DEFAULT_TTL = 300;

type GroupedInstruction = {
  name: string;
  type: string;
  ttl?: number;
  values: string[];
};

function normDnsValue(v: string): string {
  return v.replace(/\.$/, "").replace(/^"|"$/g, "");
}

/** Merge multiple A/AAAA rows for the same name into one change set. */
export function groupInstructions(
  instructions: FlyDnsRecordInstruction[],
): GroupedInstruction[] {
  const map = new Map<string, GroupedInstruction>();
  for (const ins of instructions) {
    const name = ins.name.replace(/\.$/, "");
    const key = `${name.toLowerCase()}|${ins.type}`;
    let g = map.get(key);
    if (!g) {
      g = { name, type: ins.type, ttl: ins.ttl, values: [] };
      map.set(key, g);
    }
    const val = ins.value.replace(/\.$/, "");
    if (!g.values.some((v) => normDnsValue(v) === normDnsValue(val))) {
      g.values.push(val);
    }
    if (ins.ttl != null) g.ttl = ins.ttl;
  }
  return [...map.values()];
}

export function computeChangesHash(changes: DnsRecordChange[]): string {
  const canonical = JSON.stringify(
    changes
      .map((c) => ({
        name: c.name,
        type: c.type,
        ttl: c.ttl,
        values: [...c.values].sort(),
        action: c.action,
      }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type)),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

export async function buildApplyPreview(opts: {
  appName: string;
  hostname: string;
  region?: string;
  profile?: string;
  hostedZoneId?: string;
}): Promise<FlyDomainApplyPreview> {
  const region = getRegion(opts.region);
  const cert = await checkCert(opts.appName, opts.hostname);
  const zones = await listHostedZones(region, opts.profile);
  const zone =
    (opts.hostedZoneId
      ? zones.find((z) => z.id === opts.hostedZoneId)
      : null) ?? findHostedZoneForDomain(opts.hostname, zones);
  if (!zone) {
    throw new Error(`No hosted zone found for ${opts.hostname}`);
  }
  const { changes, warnings } = await diffRecords(
    cert.dnsRecords,
    zone.id,
    region,
    opts.profile,
  );
  const preview: FlyDomainApplyPreview = {
    appName: opts.appName,
    hostname: opts.hostname,
    hostedZoneId: zone.id,
    hostedZoneName: zone.name,
    changes,
    warnings,
    changesHash: computeChangesHash(changes),
  };
  return preview;
}

async function diffRecords(
  instructions: FlyDnsRecordInstruction[],
  hostedZoneId: string,
  region: string,
  profile?: string,
): Promise<{ changes: DnsRecordChange[]; warnings: string[] }> {
  const warnings: string[] = [];
  const grouped = groupInstructions(instructions);
  const changes: DnsRecordChange[] = [];

  for (const ins of grouped) {
    const ttl = ins.ttl ?? DEFAULT_TTL;
    const rr = await getResourceRecordSet(
      hostedZoneId,
      ins.name,
      ins.type,
      region,
      profile,
    );
    const currentRaw = existingValues(rr);
    const current = currentRaw.map(normDnsValue);
    const values = ins.values;
    const want = values.map(normDnsValue).sort();
    const have = [...current].sort();
    const exists = recordSetExists(rr);

    if (exists) {
      const same =
        !rr?.AliasTarget &&
        have.length === want.length &&
        have.join("\0") === want.join("\0");
      if (same) continue;
      warnings.push(
        `${ins.name} ${ins.type}: Route 53 has ${currentRaw.join(", ")} — will replace with ${values.join(", ")}`,
      );
      changes.push({
        name: ins.name,
        type: ins.type,
        ttl,
        values,
        currentValues: currentRaw,
        action: "UPSERT",
      });
    } else {
      changes.push({
        name: ins.name,
        type: ins.type,
        ttl,
        values,
        currentValues: [],
        action: "CREATE",
      });
    }
  }
  return { changes, warnings };
}

export async function applyPreview(
  req: FlyDomainApplyRequest,
): Promise<FlyDomainApplyResult> {
  const hash = computeChangesHash(req.changes);
  if (hash !== req.changesHash) {
    const err = new Error("Preview hash mismatch — refresh preview before applying");
    (err as Error & { status: number }).status = 409;
    throw err;
  }
  const region = getRegion(req.region);
  // ponytail: upgrade CREATE→UPSERT if record appeared since preview
  const resolved: DnsRecordChange[] = [];
  for (const c of req.changes) {
    if (c.action === "CREATE") {
      const rr = await getResourceRecordSet(
        req.hostedZoneId,
        c.name,
        c.type,
        region,
        req.profile,
      );
      if (recordSetExists(rr)) {
        resolved.push({ ...c, action: "UPSERT", currentValues: existingValues(rr) });
        continue;
      }
    }
    resolved.push(c);
  }
  const result = await changeResourceRecordSets(
    req.hostedZoneId,
    resolved,
    region,
    req.profile,
  );
  return result;
}
