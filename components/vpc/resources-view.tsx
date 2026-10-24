"use client";

import { Fragment, useMemo, useState } from "react";
import { downloadText } from "@/lib/vpc/export";
import { consoleUrl } from "@/lib/vpc/links";
import { KIND_LABEL, rowsToCsv, type ResourceRow } from "@/lib/vpc/resources";
import type { ResourceKind, VpcDetail, VpcViewId } from "@/lib/vpc/types";
import {
  Card,
  Chip,
  ConsoleLink,
  CopyId,
  EmptyState,
  FilterChip,
  GhostButton,
  StateChip,
  inputClass,
  mono,
  plural,
  useSearchFocus,
} from "./ui";

type GroupBy = "none" | "type" | "subnet" | "az";

interface Props {
  vpc: VpcDetail;
  rows: ResourceRow[];
  region: string;
  subnetFilter?: string;
  onNavigate: (view: VpcViewId, params?: Record<string, string>) => void;
  onOpenResource: (key: string) => void;
}

export function ResourcesView({ vpc, rows: all, region, subnetFilter, onNavigate, onOpenResource }: Props) {
  const searchRef = useSearchFocus();
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<Set<ResourceKind>>(new Set());
  const [groupBy, setGroupBy] = useState<GroupBy>("type");

  const counts = useMemo(() => {
    const m = new Map<ResourceKind, number>();
    for (const r of all) m.set(r.kind, (m.get(r.kind) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const subnetName = (id: string) => vpc.subnets.find((s) => s.id === id)?.name || id;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((r) => kinds.size === 0 || kinds.has(r.kind))
      .filter((r) => !subnetFilter || r.subnetIds.includes(subnetFilter))
      .filter(
        (r) =>
          !q ||
          [r.name, r.id, r.detail, r.state, KIND_LABEL[r.kind], ...r.ips, ...r.subnetIds.map(subnetName)]
            .join(" ")
            .toLowerCase()
            .includes(q),
      )
      .sort((a, b) => KIND_LABEL[a.kind].localeCompare(KIND_LABEL[b.kind]) || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, kinds, query, subnetFilter]);

  const groups = useMemo(() => {
    const keyOf = (r: ResourceRow): string[] => {
      if (groupBy === "type") return [KIND_LABEL[r.kind]];
      if (groupBy === "az") return r.azs.length ? r.azs : ["No AZ (VPC-level)"];
      if (groupBy === "subnet") return r.subnetIds.length ? r.subnetIds.map(subnetName) : ["No subnet (VPC-level)"];
      return [""];
    };
    const m = new Map<string, ResourceRow[]>();
    for (const r of rows) for (const k of keyOf(r)) m.set(k, [...(m.get(k) ?? []), r]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, groupBy]);

  const toggleKind = (k: ResourceKind) =>
    setKinds((prev) => {
      const next = new Set(prev);
      if (!next.delete(k)) next.add(k);
      return next;
    });

  if (all.length === 0) {
    return <EmptyState title="Nothing deployed in this VPC" hint="No instances, gateways or network interfaces were found." />;
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, id, IP, state…  ( / )"
            aria-label="Search resources"
            className={`${inputClass} w-72`}
          />
          <label className="flex items-center gap-1.5 text-xs text-(--text-muted)">
            Group by
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className={`${inputClass} py-1 text-xs`}
            >
              <option value="type">Type</option>
              <option value="subnet">Subnet</option>
              <option value="az">Availability zone</option>
              <option value="none">Nothing</option>
            </select>
          </label>
          <div className="ml-auto">
            <GhostButton
              onClick={() => downloadText(`${vpc.id}-resources.csv`, rowsToCsv(rows), "text/csv")}
              disabled={rows.length === 0}
            >
              Export CSV
            </GhostButton>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {counts.map(([k, n]) => (
            <FilterChip key={k} active={kinds.has(k)} onClick={() => toggleKind(k)}>
              {KIND_LABEL[k]} <span className={`tabular-nums text-(--text-faint) ${mono}`}>{n}</span>
            </FilterChip>
          ))}
        </div>
        {subnetFilter && (
          <p className="text-xs text-(--text-muted)">
            Filtered to subnet <span className="font-medium text-(--text-primary)">{subnetName(subnetFilter)}</span>{" "}
            <button type="button" onClick={() => onNavigate("resources")} className="text-(--accent) hover:underline">
              clear
            </button>
          </p>
        )}
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="No resources match" hint="Try clearing the search or type filters." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead>
              <tr className="border-b border-(--border-hairline) text-(--text-muted)">
                {["Name", "Type", "ID", "State", "Location", "IPs", "Detail", ""].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(([group, items]) => (
                <Fragment key={group || "all"}>
                  {groupBy !== "none" && (
                    <tr className="bg-(--bg-deep)">
                      <td colSpan={8} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-(--text-secondary)">
                        {group} <span className="font-normal text-(--text-faint)">· {plural(items.length, "resource")}</span>
                      </td>
                    </tr>
                  )}
                  {items.map((r) => (
                    <tr
                      key={`${group}-${r.key}`}
                      onClick={() => onOpenResource(r.key)}
                      className="cursor-pointer border-b border-(--border-hairline) last:border-0 hover:bg-(--bg-hover)"
                    >
                      <td className="max-w-56 px-3 py-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenResource(r.key);
                          }}
                          className="block max-w-full truncate rounded-lg text-left font-medium text-(--text-primary) hover:text-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
                        >
                          {r.name}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1">
                          <Chip>{KIND_LABEL[r.kind]}</Chip>
                          {r.inferred && (
                            <Chip title="Worked out from network interfaces because the service API was not readable">inferred</Chip>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <CopyId value={r.id} />
                      </td>
                      <td className="px-3 py-2">
                        <StateChip state={r.state} />
                      </td>
                      <td className="px-3 py-2">
                        {r.subnetIds.length === 0 ? (
                          <span className="text-(--text-faint)">VPC-level</span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate("topology", { select: r.subnetIds[0] });
                            }}
                            className="max-w-44 truncate text-left text-(--text-secondary) hover:text-(--accent) hover:underline"
                            title="Show in topology"
                          >
                            {subnetName(r.subnetIds[0])}
                            {r.subnetIds.length > 1 && ` +${r.subnetIds.length - 1}`}
                          </button>
                        )}
                        {r.azs[0] && <span className={`ml-1 text-(--text-faint) ${mono}`}>{r.azs[0].slice(-2)}</span>}
                      </td>
                      <td className={`px-3 py-2 text-(--text-secondary) ${mono}`}>
                        {r.ips.slice(0, 2).join(" · ")}
                        {r.ips.length > 2 && ` +${r.ips.length - 2}`}
                      </td>
                      <td className="max-w-64 truncate px-3 py-2 text-(--text-muted)" title={r.detail}>
                        {r.detail}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <ConsoleLink href={r.href ?? consoleUrl(region, r.consoleType, r.lbArn ?? r.id)} label="" />
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
