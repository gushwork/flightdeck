/** IPv4 CIDR math for the VPC planner and route tester. */

export interface Cidr4 {
  base: number;
  prefix: number;
}

export function ipToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return null;
  return ((o[0] * 256 + o[1]) * 256 + o[2]) * 256 + o[3];
}

export function intToIp(n: number): string {
  return [2 ** 24, 2 ** 16, 2 ** 8, 1].map((d) => Math.floor(n / d) % 256).join(".");
}

/** Parses "a.b.c.d/p"; host bits are cleared (see `isNormalized`). */
export function parseCidr(s: string): Cidr4 | null {
  const [ip, p, ...rest] = s.trim().split("/");
  if (p === undefined || rest.length > 0 || !/^\d{1,2}$/.test(p)) return null;
  const prefix = Number(p);
  const n = ipToInt(ip);
  if (prefix > 32 || n === null) return null;
  const size = 2 ** (32 - prefix);
  return { base: Math.floor(n / size) * size, prefix };
}

export const cidrSize = (c: Cidr4) => 2 ** (32 - c.prefix);
export const cidrEnd = (c: Cidr4) => c.base + cidrSize(c) - 1;
export const cidrToString = (c: Cidr4) => `${intToIp(c.base)}/${c.prefix}`;
export const overlaps = (a: Cidr4, b: Cidr4) => a.base <= cidrEnd(b) && b.base <= cidrEnd(a);
export const contains = (outer: Cidr4, inner: Cidr4) =>
  outer.base <= inner.base && cidrEnd(inner) <= cidrEnd(outer);
export const containsIp = (c: Cidr4, ip: number) => ip >= c.base && ip <= cidrEnd(c);

/** True when the text has no host bits set (10.0.1.0/24, not 10.0.1.5/24). */
export function isNormalized(s: string): boolean {
  const c = parseCidr(s);
  return c !== null && cidrToString(c) === s.trim();
}

/** AWS reserves 5 addresses in every subnet. */
export const awsUsableIps = (prefix: number) => Math.max(0, 2 ** (32 - prefix) - 5);

/** Maximal aligned free blocks inside `parent`, ascending by address. */
export function freeBlocks(parent: Cidr4, used: Cidr4[]): Cidr4[] {
  const hit = used.filter((u) => overlaps(parent, u));
  if (hit.length === 0) return [parent];
  if (hit.some((u) => contains(u, parent)) || parent.prefix >= 32) return [];
  const half = cidrSize(parent) / 2;
  return [
    ...freeBlocks({ base: parent.base, prefix: parent.prefix + 1 }, hit),
    ...freeBlocks({ base: parent.base + half, prefix: parent.prefix + 1 }, hit),
  ];
}

/** First-fit aligned free blocks of exactly `prefix` size. */
export function freeBlocksOfSize(
  parent: Cidr4,
  used: Cidr4[],
  prefix: number,
  limit = 5,
): Cidr4[] {
  if (prefix < parent.prefix || prefix > 32) return [];
  const size = 2 ** (32 - prefix);
  const out: Cidr4[] = [];
  for (const free of freeBlocks(parent, used)) {
    if (free.prefix > prefix) continue;
    for (let b = free.base; b + size - 1 <= cidrEnd(free) && out.length < limit; b += size) {
      out.push({ base: b, prefix });
    }
    if (out.length >= limit) break;
  }
  return out;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}
