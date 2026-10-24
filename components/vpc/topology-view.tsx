"use client";

import { cn } from "@/lib/utils";
import { LB_LABEL } from "@/lib/vpc/resources";
import type { SubnetTier, VpcDetail, VpcSubnet, VpcViewId } from "@/lib/vpc/types";
import { Inspector } from "./inspector";
import { Card, Chip, UtilBar, focusRing, mono, plural, shortId, tierTone } from "./ui";

const TIERS: SubnetTier[] = ["public", "private", "isolated"];

const TIER_HINT: Record<SubnetTier, string> = {
  public: "Route to internet gateway",
  private: "Egress via NAT or other",
  isolated: "No default route",
};

const TILE_TONE: Record<SubnetTier, string> = {
  public: "border-(--success)/25 bg-(--success-muted)",
  private: "border-(--accent)/20 bg-(--accent-muted)",
  isolated: "border-(--border-hairline) bg-(--bg-field)",
};

const SERVICE_LABEL = { database: "RDS", lambda: "Lambda", cache: "Cache", container: "ECS" } as const;

/** Short labels for what runs in a subnet, e.g. ["ALB", "2 RDS", "Lambda"]. */
function serviceChips(vpc: VpcDetail, subnetId: string): string[] {
  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const lb of vpc.loadBalancers) if (lb.subnetIds.includes(subnetId)) bump(LB_LABEL[lb.type]);
  for (const s of vpc.services) if (s.subnetIds.includes(subnetId)) bump(SERVICE_LABEL[s.kind]);
  return [...counts].map(([k, n]) => (n > 1 ? `${n} ${k}` : k));
}

function SubnetTile({
  subnet,
  chips,
  index,
  selected,
  related,
  onSelect,
}: {
  subnet: VpcSubnet;
  chips: string[];
  index: number;
  selected: boolean;
  related: boolean;
  onSelect: () => void;
}) {
  const used = subnet.totalIps - subnet.availableIps;
  const others = subnet.eniCount - subnet.instanceCount;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{ animationDelay: `${index * 35}ms` }}
      className={cn(
        "vpc-pop w-full rounded-xl border p-3 text-left transition-all hover:-translate-y-px hover:border-(--accent)/50 hover:shadow-sm",
        focusRing,
        TILE_TONE[subnet.tier],
        selected && "border-(--accent)/60 shadow-md ring-2 ring-(--accent)/20",
        !selected && related && "ring-1 ring-(--accent)/30",
      )}
    >
      <p title={subnet.name || subnet.id} className="line-clamp-2 text-sm font-medium leading-snug text-(--text-primary)">
        {subnet.name || subnet.id}
      </p>
      <p className={`mt-0.5 text-xs tabular-nums text-(--text-secondary) ${mono}`}>{subnet.cidr}</p>
      <UtilBar used={used} total={subnet.totalIps} className="mt-2" />
      <div className="mt-2 flex flex-wrap gap-1">
        {subnet.natGatewayIds.length > 0 && <Chip tone="accent">NAT</Chip>}
        {subnet.instanceCount > 0 && <Chip>{subnet.instanceCount} EC2</Chip>}
        {chips.slice(0, 4).map((c) => (
          <Chip key={c} tone="accent">
            {c}
          </Chip>
        ))}
        {chips.length > 4 && <Chip>+{chips.length - 4}</Chip>}
        {others > 0 && chips.length === 0 && <Chip>{plural(others, "ENI")}</Chip>}
        {subnet.mapPublicIpOnLaunch && <Chip tone="warn">Auto IP</Chip>}
      </div>
      <p className="mt-2 truncate text-[11px] text-(--text-faint)">
        <span className={`tabular-nums ${mono}`}>{subnet.availableIps}</span> free
        {subnet.egressTarget && (
          <>
            {" · egress "}
            <span className={mono}>{shortId(subnet.egressTarget)}</span>
          </>
        )}
      </p>
    </button>
  );
}

interface Props {
  vpc: VpcDetail;
  region: string;
  selectedId?: string;
  onSelect: (id?: string) => void;
  onNavigate: (view: VpcViewId, params?: Record<string, string>) => void;
  onOpenResource: (key: string) => void;
}

export function TopologyView({ vpc, region, selectedId, onSelect, onNavigate, onOpenResource }: Props) {
  const selected = vpc.subnets.find((s) => s.id === selectedId);
  const azs = [...new Set(vpc.subnets.map((s) => s.az))].sort();
  const tiers = TIERS.filter((t) => vpc.subnets.some((s) => s.tier === t));
  const azIds = new Map(vpc.subnets.map((s) => [s.az, s.azId]));
  const hasEdge =
    vpc.loadBalancers.length + vpc.natGateways.length + vpc.endpoints.length + vpc.peerings.length + vpc.tgwAttachments.length + vpc.vpnGateways.length > 0;
  let tileIndex = 0;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <Card>
          <div className="flex items-center gap-3">
            <Chip>Internet</Chip>
            {vpc.internetGatewayId ? (
              <div className="vpc-flow flex-1" aria-hidden />
            ) : (
              <div className="h-px flex-1 bg-(--border)" aria-hidden />
            )}
            {vpc.internetGatewayId ? (
              <Chip tone="success">
                Internet gateway · <span className={mono}>{shortId(vpc.internetGatewayId)}</span>
              </Chip>
            ) : (
              <Chip title="Nothing in this VPC can be reached from, or reach, the internet directly">
                No internet gateway
              </Chip>
            )}
          </div>

          {vpc.subnets.length === 0 ? (
            <p className="mt-4 text-sm text-(--text-muted)">No subnets in this VPC yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <div
                className="grid min-w-fit gap-3"
                style={{ gridTemplateColumns: `88px repeat(${azs.length}, minmax(176px, 1fr))` }}
              >
                <div />
                {azs.map((az) => (
                  <div key={az} className="px-1">
                    <p className={`text-[11px] font-semibold uppercase tracking-wide text-(--text-secondary) ${mono}`}>{az}</p>
                    {azIds.get(az) && <p className={`text-[10px] text-(--text-faint) ${mono}`}>{azIds.get(az)}</p>}
                  </div>
                ))}
                {tiers.map((tier) => (
                  <TierRow
                    key={tier}
                    tier={tier}
                    azs={azs}
                    vpc={vpc}
                    subnets={vpc.subnets}
                    selected={selected}
                    nextIndex={() => tileIndex++}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          )}
          {tiers.length > 1 && azs.length > 1 && (
            <p className="mt-3 text-[11px] text-(--text-faint)">
              Dashed cells are gaps: a tier with no subnet in that AZ. Selecting a subnet rings the others that share its route table.
            </p>
          )}
        </Card>

        {hasEdge && (
          <Card>
            <p className="mb-2 text-xs font-medium text-(--text-secondary)">Gateways, endpoints &amp; links</p>
            <div className="flex flex-wrap gap-2">
              {[...vpc.loadBalancers]
                .sort((a, b) => a.scheme.localeCompare(b.scheme))
                .map((lb) => (
                  <button
                    key={lb.arn}
                    type="button"
                    onClick={() => onNavigate("load-balancers", { lb: lb.arn })}
                    className={cn("rounded-lg", focusRing)}
                    title="Trace listeners and targets"
                  >
                    <Chip tone={lb.scheme === "internet-facing" ? "warn" : "accent"}>
                      {LB_LABEL[lb.type]} {lb.name} · {lb.scheme}
                    </Chip>
                  </button>
                ))}
              {vpc.natGateways.map((n) => (
                <button key={n.id} type="button" onClick={() => onSelect(n.subnetId)} className={cn("rounded-lg", focusRing)} title={`In ${n.az}`}>
                  <Chip tone="accent">
                    NAT <span className={mono}>{shortId(n.id)}</span> · {n.az}
                    {n.publicIp ? ` · ${n.publicIp}` : ""}
                  </Chip>
                </button>
              ))}
              {vpc.endpoints.map((e) => (
                <button key={e.id} type="button" onClick={() => onNavigate("connectivity")} className={cn("rounded-lg", focusRing)}>
                  <Chip>
                    {e.type} endpoint · {e.service.split(".").slice(-1)[0]}
                  </Chip>
                </button>
              ))}
              {[...vpc.peerings.map((p) => `Peering · ${p.peerVpcId}`), ...vpc.tgwAttachments.map((a) => `TGW · ${a.tgwId}`), ...vpc.vpnGateways.map((g) => `VPN · ${g.id}`)].map(
                (label) => (
                  <button key={label} type="button" onClick={() => onNavigate("connectivity")} className={cn("rounded-lg", focusRing)}>
                    <Chip tone="accent">{label}</Chip>
                  </button>
                ),
              )}
            </div>
          </Card>
        )}
      </div>

      <div className="lg:sticky lg:top-0">
        <Inspector
          vpc={vpc}
          region={region}
          subnet={selected}
          onClear={() => onSelect(undefined)}
          onNavigate={onNavigate}
          onOpenResource={onOpenResource}
        />
      </div>
    </div>
  );
}

function TierRow({
  tier,
  azs,
  vpc,
  subnets,
  selected,
  nextIndex,
  onSelect,
}: {
  tier: SubnetTier;
  azs: string[];
  vpc: VpcDetail;
  subnets: VpcSubnet[];
  selected?: VpcSubnet;
  nextIndex: () => number;
  onSelect: (id?: string) => void;
}) {
  const count = subnets.filter((s) => s.tier === tier).length;
  return (
    <>
      <div className="pt-1">
        <Chip tone={tierTone(tier)} className="capitalize">
          {tier}
        </Chip>
        <p className="mt-1 text-[10px] leading-snug text-(--text-faint)">{TIER_HINT[tier]}</p>
        <p className={`text-[10px] text-(--text-faint) ${mono}`}>{count} total</p>
      </div>
      {azs.map((az) => {
        const cell = subnets.filter((s) => s.tier === tier && s.az === az);
        if (cell.length === 0) {
          return (
            <div
              key={az}
              title={`No ${tier} subnet in ${az}`}
              className="flex min-h-20 items-center justify-center rounded-xl border border-dashed border-(--border) text-[11px] text-(--text-faint)"
            >
              no {tier} subnet
            </div>
          );
        }
        return (
          <div key={az} className="space-y-2">
            {cell.map((s) => (
              <SubnetTile
                key={s.id}
                subnet={s}
                chips={serviceChips(vpc, s.id)}
                index={nextIndex()}
                selected={selected?.id === s.id}
                related={!!selected && selected.routeTableId === s.routeTableId}
                onSelect={() => onSelect(selected?.id === s.id ? undefined : s.id)}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}
