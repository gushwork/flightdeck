import type {
  FlyAppDomainRow,
  FlyCertCheckResult,
  FlyCertStatus,
  FlyCertSummary,
  FlyDnsRecordInstruction,
} from "./types";

export function mapCertStatus(raw: string | undefined): FlyCertStatus {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("ready") || s.includes("issued")) return "ready";
  if (s.includes("awaiting") || s.includes("pending") || s.includes("configur"))
    return "pending";
  if (s.includes("error") || s.includes("failed") || s.includes("invalid"))
    return "failed";
  return "unknown";
}

export function certNeedsAttention(status: FlyCertStatus): boolean {
  return status === "pending" || status === "failed";
}

export function toCertSummary(
  hostname: string,
  clientStatus: string | undefined,
  dnsConfigured?: boolean,
): FlyCertSummary {
  const status = mapCertStatus(clientStatus);
  return { hostname, status, clientStatus, dnsConfigured };
}

export function buildAppDomainRow(
  appName: string,
  org: string,
  defaultHostname: string,
  certs: FlyCertSummary[],
): FlyAppDomainRow {
  return {
    appName,
    org,
    defaultHostname,
    certs,
    needsAttention: certs.some((c) => certNeedsAttention(c.status)),
  };
}

/** ponytail: defensive parse — flyctl JSON field names vary by version. */
export function parseDnsInstructions(raw: unknown): FlyDnsRecordInstruction[] {
  const rows = extractInstructionRows(raw);
  const out: FlyDnsRecordInstruction[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const name = str(r.name ?? r.Name ?? r.hostname ?? r.Hostname);
    const type = str(r.type ?? r.Type ?? r.record_type ?? r.RecordType).toUpperCase();
    const value = str(r.value ?? r.Value ?? r.target ?? r.Target ?? r.data ?? r.Data);
    const ttl = num(r.ttl ?? r.TTL);
    if (!name || !type || !value) continue;
    if (!["A", "AAAA", "CNAME", "TXT"].includes(type)) continue;
    out.push({
      name,
      type: type as FlyDnsRecordInstruction["type"],
      value,
      ...(ttl != null ? { ttl } : {}),
    });
  }
  return out;
}

function extractInstructionRows(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const o = raw as Record<string, unknown>;
  for (const key of [
    "DNSValidationInstructions",
    "dns_validation_instructions",
    "DNSInstructions",
    "dns_instructions",
    "instructions",
    "records",
  ]) {
    const v = o[key];
    if (Array.isArray(v)) return v;
  }
  const cert = o.Certificate ?? o.certificate;
  if (cert && typeof cert === "object") {
    return extractInstructionRows(cert);
  }
  return [];
}

export function parseCertCheckResult(
  hostname: string,
  raw: unknown,
): FlyCertCheckResult {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const clientStatus = str(
    o.ClientStatus ?? o.clientStatus ?? o.Status ?? o.status,
  );
  const dnsConfigured = bool(o.Configured ?? o.configured ?? o.DNSConfigured);
  let dnsRecords = parseDnsInstructions(
    o.DNSValidationInstructions ??
      o.dns_validation_instructions ??
      o.DNSInstructions ??
      raw,
  );
  if (dnsRecords.length === 0 && o.dns_requirements) {
    dnsRecords = parseDnsRequirements(hostname, o.dns_requirements);
  }
  return {
    hostname,
    status: mapCertStatus(clientStatus),
    clientStatus: clientStatus || undefined,
    dnsConfigured,
    dnsRecords,
  };
}

/** flyctl `certs check -j` — `dns_requirements` block (current CLI). */
export function parseDnsRequirements(
  hostname: string,
  raw: unknown,
): FlyDnsRecordInstruction[] {
  if (!raw || typeof raw !== "object") return [];
  const req = raw as Record<string, unknown>;
  const host = hostname.replace(/\.$/, "");
  const out: FlyDnsRecordInstruction[] = [];

  for (const ip of asStringArray(req.a)) {
    out.push({ name: host, type: "A", value: ip });
  }
  for (const ip of asStringArray(req.aaaa)) {
    out.push({ name: host, type: "AAAA", value: ip });
  }

  const hasAddress = out.some((r) => r.name === host);
  const cname = str(req.cname);
  if (cname && !hasAddress) {
    out.push({ name: host, type: "CNAME", value: cname.replace(/\.$/, "") });
  }

  const acme = req.acme_challenge;
  if (acme && typeof acme === "object") {
    const a = acme as Record<string, unknown>;
    const name = str(a.name).replace(/\.$/, "");
    const target = str(a.target).replace(/\.$/, "");
    if (name && target) out.push({ name, type: "CNAME", value: target });
  }

  const ownership = req.ownership;
  if (ownership && typeof ownership === "object") {
    const own = ownership as Record<string, unknown>;
    const name = str(own.name).replace(/\.$/, "");
    const txt = str(own.app_value) || str(own.org_value);
    if (name && txt) out.push({ name, type: "TXT", value: txt });
  }

  return out;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x)).filter(Boolean);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  return undefined;
}
