"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { overlaps, parseCidr } from "@/lib/vpc/cidr";
import type { SubnetTier, VpcDetail } from "@/lib/vpc/types";
import { HealthRing } from "./health-ring";
import { RefreshControl } from "./refresh-control";
import { Card, Chip, CopyId, CountUp, EmptyState, GhostButton, Skeleton, focusRing, inputClass, mono, plural } from "./ui";
import { useVpcs } from "./vpc-provider";

const TIERS: SubnetTier[] = ["public", "private", "isolated"];
const DOT: Record<SubnetTier, string> = { public: "bg-(--success)", private: "bg-(--accent)", isolated: "bg-(--text-faint)" };

/** Tiny tier × AZ constellation: one dot per subnet, so shape and gaps read at a glance. */
function MiniTopology({ vpc }: { vpc: VpcDetail }) {
  const azs = [...new Set(vpc.subnets.map((s) => s.az))].sort();
  const tiers = TIERS.filter((t) => vpc.subnets.some((s) => s.tier === t));
  if (vpc.subnets.length === 0) return <p className="text-xs text-(--text-faint)">No subnets</p>;
  return (
    <div className="space-y-1" aria-hidden>
      {tiers.map((t) => (
        <div key={t} className="flex gap-2">
          {azs.map((az) => {
            const here = vpc.subnets.filter((s) => s.tier === t && s.az === az);
            return (
              <div key={az} className="flex min-h-3 min-w-6 flex-1 flex-wrap gap-0.5">
                {here.length === 0 ? (
                  <span className="h-3 w-3 rounded-[3px] border border-dashed border-(--border)" />
                ) : (
                  here.map((s) => <span key={s.id} className={cn("h-3 w-3 rounded-[3px]", DOT[t])} />)
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function VpcCard({ vpc, index }: { vpc: VpcDetail; index: number }) {
  const top = vpc.findings.find((f) => f.severity !== "info");
  const azCount = new Set(vpc.subnets.map((s) => s.az)).size;
  return (
    <Link
      href={`/vpc/${encodeURIComponent(vpc.id)}`}
      style={{ animationDelay: `${index * 50}ms` }}
      className={cn(
        "vpc-pop group block rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-4 shadow-sm transition-all hover:-translate-y-px hover:border-(--accent)/40 hover:shadow-md",
        focusRing,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-(--text-primary) group-hover:text-(--accent)">
            <span className="truncate">{vpc.name || vpc.id}</span>
            {vpc.isDefault && <Chip>Default</Chip>}
          </p>
          <div onClick={(e) => e.preventDefault()}>
            <CopyId value={vpc.id} className="text-[11px]" />
          </div>
        </div>
        <HealthRing score={vpc.score} size={48} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {vpc.cidrs.map((c) => (
          <Chip key={c.cidr} tone={c.primary ? "accent" : "muted"}>
            <span className={mono}>{c.cidr}</span>
          </Chip>
        ))}
      </div>

      <div className="mt-4">
        <MiniTopology vpc={vpc} />
      </div>

      <p className="mt-4 text-xs text-(--text-muted)">
        {plural(vpc.subnets.length, "subnet")} · {plural(azCount, "AZ")} · {plural(vpc.instances.length, "instance")} ·{" "}
        {plural(vpc.loadBalancers.length, "load balancer")} · {plural(vpc.natGateways.length, "NAT")}
      </p>
      <p className={cn("mt-1 truncate text-xs", top ? "text-(--warn)" : "text-(--success)")}>
        {top ? top.title : "No design findings"}
      </p>
    </Link>
  );
}

export function VpcList() {
  const { vpcs, region, loading, error, warnings, pending, refresh, refreshing, updatedAt } = useVpcs();
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vpcs.filter((v) => !q || [v.name, v.id, ...v.cidrs.map((c) => c.cidr)].join(" ").toLowerCase().includes(q));
  }, [vpcs, query]);

  const clashes = useMemo(() => {
    const out: { a: VpcDetail; b: VpcDetail }[] = [];
    for (let i = 0; i < vpcs.length; i++) {
      for (let j = i + 1; j < vpcs.length; j++) {
        const hit = vpcs[i].cidrs.some((x) =>
          vpcs[j].cidrs.some((y) => {
            const [p, q] = [parseCidr(x.cidr), parseCidr(y.cidr)];
            return x.kind === "ipv4" && y.kind === "ipv4" && p && q && overlaps(p, q);
          }),
        );
        if (hit) out.push({ a: vpcs[i], b: vpcs[j] });
      }
    }
    return out;
  }, [vpcs]);

  const totals = [
    { label: "VPCs", value: vpcs.length },
    { label: "Subnets", value: vpcs.reduce((n, v) => n + v.subnets.length, 0) },
    { label: "Instances", value: vpcs.reduce((n, v) => n + v.instances.length, 0) },
    { label: "Load balancers", value: vpcs.reduce((n, v) => n + v.loadBalancers.length, 0) },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--accent)">AWS</p>
          <h1 className="mt-2 font-(family-name:--font-display) text-2xl font-medium text-(--text-primary)">VPC</h1>
          <p className="mt-2 max-w-2xl text-sm text-(--text-secondary)">
            Every VPC in <span className={mono}>{region}</span>. Open one to explore its topology, resources, load balancers, routing, security and
            address plan. Read-only — nothing here changes AWS.
          </p>
        </div>
        <RefreshControl updatedAt={updatedAt} refreshing={refreshing} onRefresh={() => void refresh()} />
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {totals.map((t) => (
          <Card key={t.label} className="px-5 py-4">
            <p className={`text-3xl font-light tabular-nums text-(--text-primary) ${mono}`}>{loading ? "—" : <CountUp value={t.value} />}</p>
            <p className="mt-1 text-xs font-medium text-(--text-secondary)">{t.label}</p>
          </Card>
        ))}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-(--danger)/20 bg-(--danger-muted) px-3 py-2 text-sm text-(--danger)">
          {error}
          <GhostButton onClick={() => void refresh()}>Retry</GhostButton>
        </div>
      )}

      {pending.length > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-(--accent)/20 bg-(--accent-muted) px-3 py-2 text-xs text-(--accent)" aria-live="polite">
          <span className="h-2 w-2 animate-pulse rounded-full bg-(--accent)" aria-hidden />
          Still loading {pending.join(", ")} — the page fills in by itself.
        </p>
      )}

      {warnings.length > 0 && (
        <details className="rounded-lg border border-(--warn)/20 bg-(--warn-muted) px-3 py-2 text-xs text-(--warn)">
          <summary className="cursor-pointer font-medium">Some data could not be read ({warnings.length})</summary>
          <ul className="mt-1.5 space-y-1">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      {clashes.length > 0 && (
        <Card className="border-(--warn)/25 bg-(--warn-muted)">
          <p className="text-sm font-semibold text-(--warn)">Overlapping address space</p>
          <ul className="mt-1 space-y-0.5 text-xs text-(--text-secondary)">
            {clashes.map(({ a, b }) => (
              <li key={`${a.id}-${b.id}`}>
                {a.name || a.id} <span className={mono}>({a.cidr})</span> overlaps {b.name || b.id} <span className={mono}>({b.cidr})</span> — they cannot be
                peered.
              </li>
            ))}
          </ul>
        </Card>
      )}

      {vpcs.length > 4 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name, id or CIDR"
          aria-label="Filter VPCs"
          className={`${inputClass} w-72`}
        />
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : shown.length === 0 && !error ? (
        <EmptyState title={vpcs.length === 0 ? `No VPCs in ${region}` : "No VPCs match"} hint="Change the region or account in the top bar." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((v, i) => (
            <VpcCard key={v.id} vpc={v} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
