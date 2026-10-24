"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  type Cidr4,
  cidrSize,
  cidrToString,
  formatCount,
  freeBlocks,
  freeBlocksOfSize,
  isNormalized,
  overlaps,
  parseCidr,
  contains,
} from "@/lib/vpc/cidr";
import { buildCells, layoutToText, suggestLayout, type PlannerSubnet } from "@/lib/vpc/planner";
import type { SubnetTier, VpcDetail } from "@/lib/vpc/types";
import { Card, Chip, CopyButton, CopyId, EmptyState, SectionTitle, focusRing, inputClass, mono, plural } from "./ui";

const CELL_COLOR: Record<SubnetTier, string> = {
  public: "bg-(--success)",
  private: "bg-(--accent)",
  isolated: "bg-(--text-faint)",
};

const TIER_NAMES = ["public", "private", "data"] as const;

export function PlannerView({ vpc, others }: { vpc: VpcDetail; others: VpcDetail[] }) {
  const v4 = vpc.cidrs.filter((c) => c.kind === "ipv4");
  const [cidrIndex, setCidrIndex] = useState(0);
  const parent = parseCidr(v4[cidrIndex]?.cidr ?? v4[0]?.cidr ?? "");

  const [hoverId, setHoverId] = useState<string | undefined>();
  const [findPrefix, setFindPrefix] = useState(24);
  const [checkText, setCheckText] = useState("");
  const [tiers, setTiers] = useState<string[]>(["public", "private"]);
  const [azCount, setAzCount] = useState(Math.min(3, Math.max(2, new Set(vpc.subnets.map((s) => s.az)).size)));
  const [layoutPrefix, setLayoutPrefix] = useState(24);
  const [highlight, setHighlight] = useState<Cidr4 | undefined>();

  const subnets = useMemo<PlannerSubnet[]>(
    () =>
      vpc.subnets.flatMap((s) => {
        const cidr = parseCidr(s.cidr);
        return cidr ? [{ id: s.id, name: s.name || s.id, cidr, tier: s.tier }] : [];
      }),
    [vpc.subnets],
  );

  if (!parent) return <EmptyState title="No IPv4 address space to plan" />;

  const inside = subnets.filter((s) => contains(parent, s.cidr)).sort((a, b) => a.cidr.base - b.cidr.base);
  const used = inside.map((s) => s.cidr);
  const cells = buildCells(parent, subnets);
  const cols = Math.min(16, cells.length);
  const total = cidrSize(parent);
  const allocated = used.reduce((n, c) => n + cidrSize(c), 0);
  const free = freeBlocks(parent, used);
  const largest = free.reduce<Cidr4 | undefined>((best, f) => (!best || f.prefix < best.prefix ? f : best), undefined);

  const found = freeBlocksOfSize(parent, used, findPrefix, 6);

  const knownAzs = [...new Set(vpc.subnets.map((s) => s.az))].sort();
  const azNames = Array.from({ length: azCount }, (_, i) => knownAzs[i]?.replace(/^.*-\d/, "") || "abcdef"[i]);
  const layout = suggestLayout(parent, used, tiers, azNames, layoutPrefix);
  const plannedBlocks = layout.flatMap((b) => (b.cidr ? [b.cidr] : []));

  const checked = checkText.trim() ? parseCidr(checkText) : null;
  const checkClashSubnets = checked ? subnets.filter((s) => overlaps(s.cidr, checked)) : [];
  const checkClashVpcs = checked
    ? others.filter((o) => o.id !== vpc.id && o.cidrs.some((c) => c.kind === "ipv4" && overlaps(parseCidr(c.cidr) ?? { base: -1, prefix: 32 }, checked)))
    : [];
  const checkInside = checked ? v4.some((c) => contains(parseCidr(c.cidr) ?? { base: -1, prefix: 0 }, checked)) : false;

  const isPlanned = (cell: { base: number; prefix: number }) =>
    [...plannedBlocks, ...(highlight ? [highlight] : []), ...(checked ? [checked] : [])].some((b) => overlaps(b, cell));

  const otherVpcs = others.filter((o) => o.id !== vpc.id);

  return (
    <div className="space-y-6">
      {v4.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-(--text-muted)">Address range</span>
          {v4.map((c, i) => (
            <button
              key={c.cidr}
              type="button"
              onClick={() => setCidrIndex(i)}
              aria-pressed={i === cidrIndex}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-xs",
                mono,
                focusRing,
                i === cidrIndex ? "border-(--accent)/40 bg-(--accent-muted) text-(--accent)" : "border-(--border) bg-(--bg-surface) text-(--text-secondary)",
              )}
            >
              {c.cidr}
              {c.primary ? " · primary" : " · secondary"}
            </button>
          ))}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className={`text-sm font-semibold text-(--text-primary) ${mono}`}>{cidrToString(parent)}</p>
            <p className="text-xs text-(--text-muted)">
              <span className={`tabular-nums ${mono}`}>{Math.round((allocated / total) * 100)}%</span> allocated
            </p>
          </div>
          <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="img" aria-label="Address space map">
            {cells.map((cell) => {
              const dim = hoverId && cell.owner?.id !== hoverId;
              return (
                <div
                  key={cell.base}
                  title={`${cidrToString(cell)}${cell.owner ? ` — ${cell.owner.name} (${cell.owner.tier})` : " — free"}`}
                  className={cn(
                    "aspect-square rounded-[3px] transition-opacity",
                    cell.owner ? CELL_COLOR[cell.owner.tier] : "bg-(--bg-muted)",
                    cell.coverage === "partial" && "opacity-50",
                    dim && "opacity-20",
                    isPlanned(cell) && "outline-2 -outline-offset-1 outline-dashed outline-(--warn)",
                  )}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-(--text-muted)">
            {(["public", "private", "isolated"] as SubnetTier[]).map((t) => (
              <span key={t} className="flex items-center gap-1.5 capitalize">
                <span className={cn("h-2.5 w-2.5 rounded-[3px]", CELL_COLOR[t])} /> {t}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-(--bg-muted)" /> free
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px] outline-2 -outline-offset-1 outline-dashed outline-(--warn)" /> planned
            </span>
          </div>
          <p className="text-[11px] text-(--text-faint)">
            Each square is a /{cells[0]?.prefix}. Hover a subnet below to find it on the map.
          </p>
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Addresses", formatCount(total)],
              ["Allocated", formatCount(allocated)],
              ["Largest free", largest ? `/${largest.prefix}` : "none"],
            ].map(([label, value]) => (
              <Card key={label} className="px-4 py-3">
                <p className={`text-xl font-light tabular-nums text-(--text-primary) ${mono}`}>{value}</p>
                <p className="text-xs text-(--text-secondary)">{label}</p>
              </Card>
            ))}
          </div>

          <Card>
            <SectionTitle>Subnets in address order</SectionTitle>
            {inside.length === 0 ? (
              <p className="text-xs text-(--text-muted)">No subnets carved out of this range yet.</p>
            ) : (
              <ul className="space-y-0.5">
                {inside.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setHoverId(s.id)}
                      onMouseLeave={() => setHoverId(undefined)}
                      onFocus={() => setHoverId(s.id)}
                      onBlur={() => setHoverId(undefined)}
                      className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-(--bg-hover)", focusRing)}
                    >
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-[3px]", CELL_COLOR[s.tier])} />
                      <span className="min-w-0 flex-1 truncate text-(--text-primary)">{s.name}</span>
                      <span className={`text-(--text-secondary) ${mono}`}>{cidrToString(s.cidr)}</span>
                      <span className={`w-16 text-right tabular-nums text-(--text-faint) ${mono}`}>{formatCount(cidrSize(s.cidr))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="space-y-3">
          <SectionTitle>Find free space</SectionTitle>
          <label className="flex items-center gap-2 text-xs text-(--text-muted)">
            I need a
            <select value={findPrefix} onChange={(e) => setFindPrefix(Number(e.target.value))} className={`${inputClass} py-1 text-xs`}>
              {Array.from({ length: 28 - parent.prefix + 1 }, (_, i) => parent.prefix + i).map((p) => (
                <option key={p} value={p}>
                  /{p} — {formatCount(2 ** (32 - p) - 5)} usable
                </option>
              ))}
            </select>
          </label>
          {found.length === 0 ? (
            <p className="text-xs text-(--warn)">No aligned /{findPrefix} block is free in this range.</p>
          ) : (
            <ul className="space-y-1">
              {found.map((c) => (
                <li
                  key={c.base}
                  onMouseEnter={() => setHighlight(c)}
                  onMouseLeave={() => setHighlight(undefined)}
                  className="flex items-center justify-between rounded-lg px-2 py-1 hover:bg-(--bg-hover)"
                >
                  <CopyId value={cidrToString(c)} />
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-(--text-faint)">
            Free space is {plural(free.length, "block")}
            {largest ? `, the biggest being ${cidrToString(largest)}` : ""}.
          </p>
        </Card>

        <Card className="space-y-3">
          <SectionTitle>Check a CIDR</SectionTitle>
          <input
            value={checkText}
            onChange={(e) => setCheckText(e.target.value)}
            placeholder="e.g. 10.0.8.0/22"
            spellCheck={false}
            aria-label="CIDR to check"
            className={`${inputClass} ${mono} w-full`}
          />
          {checkText.trim() === "" ? (
            <p className="text-xs text-(--text-muted)">See at a glance whether a range fits, collides with a subnet, or overlaps another VPC.</p>
          ) : !checked ? (
            <p className="text-xs text-(--danger)">Not a valid IPv4 CIDR.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {!isNormalized(checkText) && (
                <li className="text-(--warn)">Host bits are set — did you mean {cidrToString(checked)}?</li>
              )}
              <li className={checkInside ? "text-(--success)" : "text-(--warn)"}>
                {checkInside ? "Fits inside this VPC's address space." : "Outside this VPC's address space."}
              </li>
              <li className={checkClashSubnets.length ? "text-(--danger)" : "text-(--success)"}>
                {checkClashSubnets.length ? `Collides with ${checkClashSubnets.map((s) => s.name).join(", ")}.` : "No collision with existing subnets."}
              </li>
              <li className={checkClashVpcs.length ? "text-(--warn)" : "text-(--success)"}>
                {checkClashVpcs.length
                  ? `Overlaps VPC ${checkClashVpcs.map((o) => o.name || o.id).join(", ")} — they could never be peered.`
                  : "Does not overlap other VPCs in this region."}
              </li>
            </ul>
          )}
        </Card>

        <Card className="space-y-3">
          <SectionTitle>Suggest a layout</SectionTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-(--text-muted)">
            {TIER_NAMES.map((t) => (
              <label key={t} className="flex items-center gap-1 capitalize">
                <input
                  type="checkbox"
                  checked={tiers.includes(t)}
                  onChange={(e) => setTiers((prev) => (e.target.checked ? TIER_NAMES.filter((x) => x === t || prev.includes(x)) : prev.filter((x) => x !== t)))}
                  className="h-3.5 w-3.5 accent-(--accent)"
                />
                {t}
              </label>
            ))}
            <label className="flex items-center gap-1">
              ×
              <select value={azCount} onChange={(e) => setAzCount(Number(e.target.value))} className={`${inputClass} py-0.5 text-xs`}>
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} AZs
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              each
              <select value={layoutPrefix} onChange={(e) => setLayoutPrefix(Number(e.target.value))} className={`${inputClass} py-0.5 text-xs`}>
                {Array.from({ length: 28 - parent.prefix + 1 }, (_, i) => parent.prefix + i).map((p) => (
                  <option key={p} value={p}>
                    /{p}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {layout.length === 0 ? (
            <p className="text-xs text-(--text-muted)">Pick at least one tier.</p>
          ) : (
            <>
              <ul className={`space-y-0.5 text-xs ${mono}`}>
                {layout.map((b) => (
                  <li key={`${b.tier}-${b.az}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-0.5">
                    <span className="text-(--text-secondary)">
                      {b.tier}-{b.az}
                    </span>
                    {b.cidr ? <span className="text-(--text-primary)">{cidrToString(b.cidr)}</span> : <Chip tone="warn">no room</Chip>}
                  </li>
                ))}
              </ul>
              <CopyButton text={layoutToText(layout)} label="Copy layout" />
            </>
          )}
          <p className="text-[11px] text-(--text-faint)">Planned blocks show as dashed squares on the map. Nothing is created in AWS.</p>
        </Card>
      </div>

      {otherVpcs.length > 0 && (
        <Card>
          <SectionTitle>Other VPCs in this region</SectionTitle>
          <ul className="space-y-1.5">
            {otherVpcs.map((o) => {
              const clash = o.cidrs.some((c) => c.kind === "ipv4" && v4.some((m) => overlaps(parseCidr(c.cidr) ?? { base: -1, prefix: 32 }, parseCidr(m.cidr) ?? { base: -2, prefix: 32 })));
              return (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-(--text-primary)">{o.name || o.id}</span>
                  <span className="flex items-center gap-2">
                    <span className={`text-(--text-secondary) ${mono}`}>{o.cidrs.filter((c) => c.kind === "ipv4").map((c) => c.cidr).join(", ")}</span>
                    <Chip tone={clash ? "warn" : "success"}>{clash ? "overlaps" : "distinct"}</Chip>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
