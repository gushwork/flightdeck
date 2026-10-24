"use client";

import { describeTarget } from "@/lib/vpc/routing";
import { consoleUrl } from "@/lib/vpc/links";
import { KIND_LABEL, buildResourceRows } from "@/lib/vpc/resources";
import { formatCount } from "@/lib/vpc/cidr";
import type { VpcDetail, VpcSubnet, VpcViewId } from "@/lib/vpc/types";
import {
  Card,
  Chip,
  ConsoleLink,
  CopyId,
  GhostButton,
  StateChip,
  TierChip,
  UtilBar,
  mono,
} from "./ui";

const TIER_EXPLAIN = {
  public: "Default route goes to an internet gateway. Resources here can be reached from the internet if they have a public IP.",
  private: "Default route goes to a NAT gateway or other target. Resources can reach out but are not directly reachable.",
  isolated: "No default route. Resources here can only talk inside the VPC (and to endpoints/peers you add).",
} as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-xs">
      <dt className="shrink-0 text-(--text-muted)">{label}</dt>
      <dd className="min-w-0 text-right text-(--text-primary)">{children}</dd>
    </div>
  );
}

interface Props {
  vpc: VpcDetail;
  region: string;
  subnet?: VpcSubnet;
  onClear: () => void;
  onNavigate: (view: VpcViewId, params?: Record<string, string>) => void;
  onOpenResource: (key: string) => void;
}

/** Right-hand detail panel: the VPC itself, or whichever subnet is selected. */
export function Inspector({ vpc, region, subnet, onClear, onNavigate, onOpenResource }: Props) {
  if (subnet) {
    const table = vpc.routeTables.find((t) => t.id === subnet.routeTableId);
    const here = buildResourceRows(vpc).filter((r) => r.subnetIds.includes(subnet.id));
    const used = subnet.totalIps - subnet.availableIps;
    return (
      <Card className="vpc-pop space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-(--text-primary)">{subnet.name || subnet.id}</p>
            <CopyId value={subnet.id} />
          </div>
          <button
            type="button"
            onClick={onClear}
            aria-label="Close inspector"
            className="rounded-lg px-2 py-0.5 text-xs text-(--text-muted) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
          >
            Esc
          </button>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <TierChip tier={subnet.tier} />
            {subnet.mapPublicIpOnLaunch && <Chip tone="warn">Auto public IP</Chip>}
            <StateChip state={subnet.state} />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-(--text-muted)">{TIER_EXPLAIN[subnet.tier]}</p>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className={`text-(--text-primary) ${mono}`}>{subnet.cidr}</span>
            <span className="text-(--text-muted)">
              <span className={`tabular-nums ${mono}`}>{formatCount(used)}</span> of{" "}
              <span className={`tabular-nums ${mono}`}>{formatCount(subnet.totalIps)}</span> in use
            </span>
          </div>
          <UtilBar used={used} total={subnet.totalIps} />
        </div>

        <dl className="divide-y divide-(--border-hairline)">
          <Row label="Availability zone">
            <span className={mono}>{subnet.az}</span>
            {subnet.azId && <span className={`ml-1 text-(--text-faint) ${mono}`}>{subnet.azId}</span>}
          </Row>
          <Row label="Route table">
            {table ? <CopyId value={table.id} /> : "—"}
          </Row>
          <Row label="Egress">
            {subnet.egressTarget ? (
              <Chip tone={describeTarget(subnet.egressTarget).tone}>{subnet.egressTarget}</Chip>
            ) : (
              <span className="text-(--text-muted)">none</span>
            )}
          </Row>
          <Row label="Network ACL">{subnet.networkAclId ? <CopyId value={subnet.networkAclId} /> : "—"}</Row>
          {subnet.ipv6Cidrs.length > 0 && (
            <Row label="IPv6">
              <span className={mono}>{subnet.ipv6Cidrs.join(", ")}</span>
            </Row>
          )}
        </dl>

        {table && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-(--text-secondary)">Routes</p>
            <ul className={`space-y-1 text-[11px] ${mono}`}>
              {table.routes.map((r) => (
                <li key={`${r.destination}-${r.target}`} className="flex items-center justify-between gap-2">
                  <span className="truncate text-(--text-secondary)">{r.destination}</span>
                  <Chip tone={r.state === "blackhole" ? "danger" : describeTarget(r.target).tone}>{r.target}</Chip>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-medium text-(--text-secondary)">
            Living here <span className="text-(--text-faint)">({here.length})</span>
          </p>
          {here.length === 0 ? (
            <p className="text-xs text-(--text-muted)">Nothing yet — free real estate.</p>
          ) : (
            <ul className="space-y-1">
              {here.slice(0, 8).map((r) => (
                <li key={r.key}>
                  <button
                    type="button"
                    onClick={() => onOpenResource(r.key)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left text-xs hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
                  >
                    <span className="truncate text-(--text-primary)">{r.name}</span>
                    <Chip>{KIND_LABEL[r.kind]}</Chip>
                  </button>
                </li>
              ))}
              {here.length > 8 && (
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigate("resources", { subnet: subnet.id })}
                    className="text-xs text-(--accent) hover:underline"
                  >
                    +{here.length - 8} more in Resources
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-(--border-hairline) pt-3">
          <GhostButton onClick={() => onNavigate("routing", { from: subnet.id })}>Test a route</GhostButton>
          <GhostButton onClick={() => onNavigate("resources", { subnet: subnet.id })}>Resources here</GhostButton>
          <ConsoleLink href={consoleUrl(region, "subnet", subnet.id)} />
        </div>
      </Card>
    );
  }

  const dhcp = vpc.dhcp?.options ?? {};
  return (
    <Card className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-(--text-primary)">About this VPC</p>
        <p className="mt-1 text-xs text-(--text-muted)">Click any subnet to inspect it.</p>
      </div>
      <dl className="divide-y divide-(--border-hairline)">
        <Row label="VPC ID">
          <CopyId value={vpc.id} />
        </Row>
        <Row label="Account">
          <span className={mono}>{vpc.ownerId}</span>
        </Row>
        <Row label="Tenancy">{vpc.tenancy}</Row>
        <Row label="DNS resolution">
          <Chip tone={vpc.dnsSupport ? "success" : "muted"}>{vpc.dnsSupport ? "on" : "off"}</Chip>
        </Row>
        <Row label="DNS hostnames">
          <Chip tone={vpc.dnsHostnames ? "success" : "muted"}>{vpc.dnsHostnames ? "on" : "off"}</Chip>
        </Row>
        <Row label="Flow logs">
          {vpc.flowLogs === null ? (
            <Chip>unknown</Chip>
          ) : vpc.flowLogs.length === 0 ? (
            <Chip tone="warn">not enabled</Chip>
          ) : (
            <Chip tone="success">{vpc.flowLogs.length} enabled</Chip>
          )}
        </Row>
        {vpc.dhcp && (
          <Row label="DHCP options">
            <CopyId value={vpc.dhcp.id} />
          </Row>
        )}
        {dhcp["domain-name"] && (
          <Row label="Domain name">
            <span className={mono}>{dhcp["domain-name"].join(", ")}</span>
          </Row>
        )}
      </dl>
      <div>
        <p className="mb-1.5 text-xs font-medium text-(--text-secondary)">Address space</p>
        <div className="flex flex-wrap gap-1.5">
          {vpc.cidrs.map((c) => (
            <Chip key={c.cidr} tone={c.primary ? "accent" : "muted"} title={c.state}>
              <span className={mono}>{c.cidr}</span>
              {c.primary ? " · primary" : c.kind === "ipv6" ? " · IPv6" : " · secondary"}
            </Chip>
          ))}
        </div>
      </div>
      {Object.keys(vpc.tags).length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-(--text-secondary)">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(vpc.tags).map(([k, v]) => (
              <Chip key={k} title={`${k} = ${v}`}>
                {k}: {v}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-(--border-hairline) pt-3">
        <GhostButton onClick={() => onNavigate("review")}>Design review</GhostButton>
        <ConsoleLink href={consoleUrl(region, "vpc", vpc.id)} />
      </div>
    </Card>
  );
}
