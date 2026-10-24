import {
  type Cidr4,
  cidrSize,
  cidrToString,
  contains,
  freeBlocksOfSize,
  overlaps,
} from "@/lib/vpc/cidr";
import type { SubnetTier } from "@/lib/vpc/types";

export interface PlannerSubnet {
  id: string;
  name: string;
  cidr: Cidr4;
  tier: SubnetTier;
}

export interface PlannerCell {
  base: number;
  prefix: number;
  coverage: "full" | "partial" | "free";
  owner?: PlannerSubnet;
}

/** Grid granularity: 8 prefix bits below the parent, so the grid never exceeds 256 cells. */
export const cellPrefixFor = (parent: Cidr4) => Math.min(32, parent.prefix + 8);

export function buildCells(parent: Cidr4, subnets: PlannerSubnet[]): PlannerCell[] {
  const prefix = cellPrefixFor(parent);
  const size = 2 ** (32 - prefix);
  const count = cidrSize(parent) / size;
  const cells: PlannerCell[] = [];
  for (let i = 0; i < count; i++) {
    const cell = { base: parent.base + i * size, prefix };
    const owner = subnets.find((s) => overlaps(s.cidr, cell));
    const full = owner && subnets.some((s) => contains(s.cidr, cell));
    cells.push({
      ...cell,
      coverage: !owner ? "free" : full ? "full" : "partial",
      owner: full ? subnets.find((s) => contains(s.cidr, cell)) : owner,
    });
  }
  return cells;
}

export interface PlannedBlock {
  tier: string;
  az: string;
  cidr?: Cidr4;
}

/** Assigns one aligned free block per tier × AZ, first-fit, tier-major. */
export function suggestLayout(
  parent: Cidr4,
  used: Cidr4[],
  tiers: string[],
  azs: string[],
  prefix: number,
): PlannedBlock[] {
  const taken = [...used];
  const out: PlannedBlock[] = [];
  for (const tier of tiers) {
    for (const az of azs) {
      const cidr = freeBlocksOfSize(parent, taken, prefix, 1)[0];
      if (cidr) taken.push(cidr);
      out.push({ tier, az, cidr });
    }
  }
  return out;
}

export function layoutToText(blocks: PlannedBlock[]): string {
  return blocks
    .map((b) => `${b.tier}-${b.az}\t${b.cidr ? cidrToString(b.cidr) : "(no room)"}`)
    .join("\n");
}
