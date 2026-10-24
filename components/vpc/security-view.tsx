"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { consoleUrl } from "@/lib/vpc/links";
import { isWorldRule, riskyInbound, worldRisk } from "@/lib/vpc/review";
import type { AclEntry, SgRule, VpcDetail, VpcNetworkAcl, VpcSecurityGroup } from "@/lib/vpc/types";
import { Card, Chip, ConsoleLink, CopyId, EmptyState, FilterChip, SectionTitle, focusRing, inputClass, mono, plural, useSearchFocus } from "./ui";

function RuleTable({ title, rules }: { title: string; rules: SgRule[] }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-(--text-muted)">{title}</p>
      {rules.length === 0 ? (
        <p className="text-xs text-(--text-faint)">No rules — all {title.toLowerCase()} traffic is denied.</p>
      ) : (
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="text-(--text-muted)">
              <th className="py-1 font-medium">Protocol</th>
              <th className="py-1 font-medium">Ports</th>
              <th className="py-1 font-medium">{title === "Inbound" ? "Source" : "Destination"}</th>
              <th className="py-1 font-medium">Description</th>
            </tr>
          </thead>
          <tbody className={mono}>
            {rules.map((r, i) => {
              const risk = worldRisk(r);
              return (
                <tr key={`${r.source}-${r.ports}-${i}`} className="border-t border-(--border-hairline)">
                  <td className="py-1 text-(--text-secondary)">{r.protocol}</td>
                  <td className="py-1 text-(--text-secondary)">{r.ports}</td>
                  <td className="py-1">
                    <Chip tone={risk === "high" ? "danger" : risk === "medium" ? "warn" : r.sourceKind === "sg" ? "accent" : "muted"}>
                      {isWorldRule(r) ? `${r.source} · anywhere` : r.source}
                    </Chip>
                  </td>
                  <td className="py-1 font-sans text-(--text-muted)">{r.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SecurityGroupCard({ sg, region, open, onToggle }: { sg: VpcSecurityGroup; region: string; open: boolean; onToggle: () => void }) {
  const risky = riskyInbound(sg);
  const high = risky.some((r) => worldRisk(r) === "high");
  return (
    <Card className="p-0">
      <button type="button" onClick={onToggle} aria-expanded={open} className={cn("flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-(--bg-hover)", focusRing)}>
        <span aria-hidden className={cn("text-xs text-(--text-faint) transition-transform", open && "rotate-90")}>
          ▶
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-(--text-primary)">{sg.name}</span>
          <span className={`block truncate text-[11px] text-(--text-muted) ${mono}`}>{sg.id}</span>
        </span>
        <span className="flex flex-wrap items-center justify-end gap-1.5">
          {sg.isDefault && <Chip>default</Chip>}
          {risky.length > 0 && <Chip tone={high ? "danger" : "warn"}>open to the internet</Chip>}
          {sg.eniCount === 0 && !sg.isDefault && sg.referencedBy.length === 0 && <Chip tone="warn">unused</Chip>}
          <Chip>{plural(sg.eniCount, "interface")}</Chip>
          <Chip>{sg.inbound.length} in · {sg.outbound.length} out</Chip>
        </span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-(--border-hairline) px-4 py-3">
          {sg.description && <p className="text-xs text-(--text-muted)">{sg.description}</p>}
          <RuleTable title="Inbound" rules={sg.inbound} />
          <RuleTable title="Outbound" rules={sg.outbound} />
          {sg.referencedBy.length > 0 && (
            <p className="text-xs text-(--text-muted)">
              Referenced by{" "}
              {sg.referencedBy.map((id) => (
                <CopyId key={id} value={id} className="text-[11px]" />
              ))}
            </p>
          )}
          <ConsoleLink href={consoleUrl(region, "security-group", sg.id)} label="Open in console" />
        </div>
      )}
    </Card>
  );
}

function AclTable({ title, entries }: { title: string; entries: AclEntry[] }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-(--text-muted)">{title}</p>
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr className="text-(--text-muted)">
            {["Rule", "Protocol", "Ports", "CIDR", "Action"].map((h) => (
              <th key={h} className="py-1 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={mono}>
          {entries.map((e) => (
            <tr key={`${e.rule}-${e.cidr}`} className="border-t border-(--border-hairline)">
              <td className="py-1 text-(--text-secondary)">{e.rule}</td>
              <td className="py-1 text-(--text-secondary)">{e.protocol}</td>
              <td className="py-1 text-(--text-secondary)">{e.ports}</td>
              <td className="py-1 text-(--text-secondary)">{e.cidr}</td>
              <td className="py-1">
                <Chip tone={e.action === "allow" ? "success" : "danger"}>{e.action}</Chip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AclCard({ acl, vpc, region }: { acl: VpcNetworkAcl; vpc: VpcDetail; region: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn("flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-(--bg-hover)", focusRing)}>
        <span aria-hidden className={cn("text-xs text-(--text-faint) transition-transform", open && "rotate-90")}>
          ▶
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-(--text-primary)">{acl.name || acl.id}</span>
          <span className={`block truncate text-[11px] text-(--text-muted) ${mono}`}>{acl.id}</span>
        </span>
        {acl.isDefault && <Chip>default</Chip>}
        <Chip>{plural(acl.subnetIds.length, "subnet")}</Chip>
      </button>
      {open && (
        <div className="space-y-4 border-t border-(--border-hairline) px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {acl.subnetIds.map((id) => (
              <Chip key={id}>{vpc.subnets.find((s) => s.id === id)?.name || id}</Chip>
            ))}
          </div>
          <AclTable title="Inbound" entries={acl.inbound} />
          <AclTable title="Outbound" entries={acl.outbound} />
          <ConsoleLink href={consoleUrl(region, "network-acl", acl.id)} label="Open in console" />
        </div>
      )}
    </Card>
  );
}

export function SecurityView({ vpc, region, focusId }: { vpc: VpcDetail; region: string; focusId?: string }) {
  const searchRef = useSearchFocus();
  const [query, setQuery] = useState("");
  const [riskyOnly, setRiskyOnly] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set(focusId ? [focusId] : []));

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vpc.securityGroups
      .filter((g) => !riskyOnly || riskyInbound(g).length > 0)
      .filter((g) => !q || [g.name, g.id, g.description].join(" ").toLowerCase().includes(q))
      .sort((a, b) => riskyInbound(b).length - riskyInbound(a).length || a.name.localeCompare(b.name));
  }, [vpc.securityGroups, query, riskyOnly]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>Security groups ({vpc.securityGroups.length})</SectionTitle>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, id, description…  ( / )"
            aria-label="Search security groups"
            className={`${inputClass} w-72`}
          />
          <FilterChip active={riskyOnly} onClick={() => setRiskyOnly((v) => !v)}>
            Open to the internet only
          </FilterChip>
        </div>
        {groups.length === 0 ? (
          <EmptyState title={vpc.securityGroups.length === 0 ? "No security groups found" : "No security groups match"} />
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <SecurityGroupCard key={g.id} sg={g} region={region} open={open.has(g.id)} onToggle={() => toggle(g.id)} />
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionTitle>Network ACLs ({vpc.networkAcls.length})</SectionTitle>
        {vpc.networkAcls.length === 0 ? (
          <EmptyState title="No network ACLs found" />
        ) : (
          <div className="space-y-2">
            {vpc.networkAcls.map((a) => (
              <AclCard key={a.id} acl={a} vpc={vpc} region={region} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
