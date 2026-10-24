"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { cidrSize, formatCount, parseCidr } from "@/lib/vpc/cidr";
import { consoleUrl } from "@/lib/vpc/links";
import type { SubnetTier, VpcDetail, VpcSubnet, VpcViewId } from "@/lib/vpc/types";
import {
  Card,
  Chip,
  ConsoleLink,
  CopyId,
  EmptyState,
  FilterChip,
  TierChip,
  UtilBar,
  focusRing,
  inputClass,
  mono,
  useSearchFocus,
} from "./ui";

type SortKey = "name" | "cidr" | "az" | "tier" | "used" | "free";

const TIERS: SubnetTier[] = ["public", "private", "isolated"];

interface Props {
  vpc: VpcDetail;
  region: string;
  onNavigate: (view: VpcViewId, params?: Record<string, string>) => void;
}

const pctUsed = (s: VpcSubnet) => (s.totalIps > 0 ? (s.totalIps - s.availableIps) / s.totalIps : 0);

export function SubnetsView({ vpc, region, onNavigate }: Props) {
  const searchRef = useSearchFocus();
  const [query, setQuery] = useState("");
  const [tiers, setTiers] = useState<Set<SubnetTier>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "az", dir: 1 });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const value = (s: VpcSubnet): string | number => {
      switch (sort.key) {
        case "name":
          return (s.name || s.id).toLowerCase();
        case "cidr":
          return parseCidr(s.cidr)?.base ?? 0;
        case "az":
          return `${s.az}${s.cidr}`;
        case "tier":
          return TIERS.indexOf(s.tier);
        case "used":
          return pctUsed(s);
        case "free":
          return s.availableIps;
      }
    };
    return vpc.subnets
      .filter((s) => tiers.size === 0 || tiers.has(s.tier))
      .filter((s) => !q || [s.name, s.id, s.cidr, s.az, s.routeTableId ?? ""].join(" ").toLowerCase().includes(q))
      .sort((a, b) => {
        const [x, y] = [value(a), value(b)];
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
  }, [vpc.subnets, query, tiers, sort]);

  const head = (key: SortKey, label: string) => (
    <th key={key} className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={() => setSort((p) => ({ key, dir: p.key === key ? (p.dir === 1 ? -1 : 1) : 1 }))}
        className={cn("inline-flex items-center gap-1 rounded-lg hover:text-(--accent)", focusRing)}
      >
        {label}
        {sort.key === key && <span aria-hidden>{sort.dir === 1 ? "↑" : "↓"}</span>}
      </button>
    </th>
  );

  if (vpc.subnets.length === 0) return <EmptyState title="No subnets in this VPC" />;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-2">
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, CIDR, AZ…  ( / )"
          aria-label="Search subnets"
          className={`${inputClass} w-72`}
        />
        {TIERS.map((t) => (
          <FilterChip
            key={t}
            active={tiers.has(t)}
            onClick={() =>
              setTiers((prev) => {
                const next = new Set(prev);
                if (!next.delete(t)) next.add(t);
                return next;
              })
            }
          >
            <span className="capitalize">{t}</span>{" "}
            <span className={`tabular-nums text-(--text-faint) ${mono}`}>{vpc.subnets.filter((s) => s.tier === t).length}</span>
          </FilterChip>
        ))}
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[980px] text-left text-xs">
          <thead>
            <tr className="border-b border-(--border-hairline) text-(--text-muted)">
              {head("name", "Name")}
              {head("cidr", "CIDR")}
              {head("az", "AZ")}
              {head("tier", "Tier")}
              {head("used", "Utilisation")}
              <th className="px-3 py-2 font-medium">Contents</th>
              <th className="px-3 py-2 font-medium">Route table</th>
              <th className="px-3 py-2 font-medium">NACL</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const used = s.totalIps - s.availableIps;
              return (
                <tr key={s.id} className="border-b border-(--border-hairline) last:border-0 hover:bg-(--bg-hover)">
                  <td className="px-3 py-2">
                    <p className="max-w-52 truncate font-medium text-(--text-primary)">{s.name || "—"}</p>
                    <CopyId value={s.id} className="text-[11px]" />
                  </td>
                  <td className={`px-3 py-2 text-(--text-secondary) ${mono}`}>
                    {s.cidr}
                    <p className="text-[10px] text-(--text-faint)">/{parseCidr(s.cidr)?.prefix} · {formatCount(cidrSize(parseCidr(s.cidr) ?? { base: 0, prefix: 32 }))} addrs</p>
                  </td>
                  <td className={`px-3 py-2 text-(--text-secondary) ${mono}`}>
                    {s.az}
                    {s.defaultForAz && <p className="font-sans text-[10px] text-(--text-faint)">default for AZ</p>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <TierChip tier={s.tier} />
                      {s.mapPublicIpOnLaunch && <Chip tone="warn">Auto IP</Chip>}
                    </div>
                  </td>
                  <td className="w-44 px-3 py-2">
                    <UtilBar used={used} total={s.totalIps} />
                    <p className={`mt-1 text-[10px] tabular-nums text-(--text-muted) ${mono}`}>
                      {formatCount(used)} / {formatCount(s.totalIps)} · {Math.round(pctUsed(s) * 100)}%
                    </p>
                  </td>
                  <td className="px-3 py-2 text-(--text-secondary)">
                    {s.eniCount === 0 ? (
                      <span className="text-(--text-faint)">empty</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onNavigate("resources", { subnet: s.id })}
                        className="hover:text-(--accent) hover:underline"
                      >
                        {s.instanceCount} EC2 · {s.eniCount} ENI
                      </button>
                    )}
                    {s.natGatewayIds.length > 0 && <Chip tone="accent" className="ml-1">NAT</Chip>}
                  </td>
                  <td className="px-3 py-2">{s.routeTableId ? <CopyId value={s.routeTableId} className="text-[11px]" /> : "—"}</td>
                  <td className="px-3 py-2">{s.networkAclId ? <CopyId value={s.networkAclId} className="text-[11px]" /> : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onNavigate("topology", { select: s.id })}
                      className={cn("rounded-lg px-1.5 py-0.5 text-[11px] font-medium text-(--text-muted) hover:bg-(--bg-hover) hover:text-(--accent)", focusRing)}
                    >
                      Show
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate("routing", { from: s.id })}
                      className={cn("rounded-lg px-1.5 py-0.5 text-[11px] font-medium text-(--text-muted) hover:bg-(--bg-hover) hover:text-(--accent)", focusRing)}
                    >
                      Routes
                    </button>
                    <ConsoleLink href={consoleUrl(region, "subnet", s.id)} label="" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-(--text-muted)">No subnets match.</p>}
      </Card>
    </div>
  );
}
