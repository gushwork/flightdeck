"use client";

import { consoleUrl } from "@/lib/vpc/links";
import type { VpcDetail } from "@/lib/vpc/types";
import { Card, Chip, ConsoleLink, CopyId, EmptyState, SectionTitle, StateChip, mono, plural } from "./ui";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-xs">
      <dt className="text-(--text-muted)">{label}</dt>
      <dd className="min-w-0 truncate text-right text-(--text-primary)">{children}</dd>
    </div>
  );
}

export function ConnectivityView({ vpc, region }: { vpc: VpcDetail; region: string }) {
  const subnetName = (id: string) => vpc.subnets.find((s) => s.id === id)?.name || id;
  const privateSubnets = vpc.subnets.filter((s) => s.tier === "private").length;

  return (
    <div className="space-y-8">
      <section>
        <SectionTitle>Internet access</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-(--text-primary)">Internet gateway</p>
              {vpc.internetGatewayId ? <StateChip state="attached" /> : <Chip>none</Chip>}
            </div>
            {vpc.internetGatewayId ? (
              <div className="mt-2 flex items-center justify-between">
                <CopyId value={vpc.internetGatewayId} />
                <ConsoleLink href={consoleUrl(region, "internet-gateway", vpc.internetGatewayId)} />
              </div>
            ) : (
              <p className="mt-2 text-xs text-(--text-muted)">No subnet can be public until an internet gateway is attached and routed to.</p>
            )}
            <p className="mt-3 text-xs text-(--text-muted)">
              {vpc.subnets.filter((s) => s.tier === "public").length} public subnet(s) route through it.
            </p>
          </Card>
          <Card>
            <p className="text-sm font-semibold text-(--text-primary)">Egress-only internet gateways</p>
            {vpc.egressOnlyIgws.length === 0 ? (
              <p className="mt-2 text-xs text-(--text-muted)">None. Only needed for IPv6 outbound-only access.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {vpc.egressOnlyIgws.map((g) => (
                  <li key={g.id} className="flex items-center justify-between">
                    <CopyId value={g.id} />
                    <StateChip state={g.state} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>

      <section>
        <SectionTitle>NAT gateways ({vpc.natGateways.length})</SectionTitle>
        {vpc.natGateways.length === 0 ? (
          <EmptyState
            title="No NAT gateways"
            hint={privateSubnets > 0 ? `${plural(privateSubnets, "private subnet")} egress through other targets.` : "Private subnets would need one to reach the internet."}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {vpc.natGateways.map((n) => {
              const users = vpc.subnets.filter((s) => s.egressTarget === n.id);
              return (
                <Card key={n.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-(--text-primary)">{n.name || n.id}</p>
                      <CopyId value={n.id} />
                    </div>
                    <StateChip state={n.state} />
                  </div>
                  <dl className="mt-2 divide-y divide-(--border-hairline)">
                    <Field label="Lives in">
                      {subnetName(n.subnetId)} · <span className={mono}>{n.az}</span>
                    </Field>
                    <Field label="Type">{n.connectivity}</Field>
                    {n.publicIp && (
                      <Field label="Elastic IP">
                        <span className={mono}>{n.publicIp}</span>
                      </Field>
                    )}
                    {n.privateIp && (
                      <Field label="Private IP">
                        <span className={mono}>{n.privateIp}</span>
                      </Field>
                    )}
                    <Field label="Used by">{plural(users.length, "subnet")}</Field>
                  </dl>
                  <div className="mt-2 text-right">
                    <ConsoleLink href={consoleUrl(region, "nat-gateway", n.id)} />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>VPC endpoints ({vpc.endpoints.length})</SectionTitle>
        {vpc.endpoints.length === 0 ? (
          <EmptyState title="No VPC endpoints" hint="Endpoints keep AWS service traffic (S3, DynamoDB, ECR…) off the NAT gateway." />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="border-b border-(--border-hairline) text-(--text-muted)">
                  {["Service", "Type", "State", "Private DNS", "Attached to", ""].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vpc.endpoints.map((e) => (
                  <tr key={e.id} className="border-b border-(--border-hairline) last:border-0 hover:bg-(--bg-hover)">
                    <td className="px-3 py-2">
                      <p className={`text-(--text-primary) ${mono}`}>{e.service}</p>
                      <CopyId value={e.id} className="text-[11px]" />
                    </td>
                    <td className="px-3 py-2">
                      <Chip tone={e.type === "Gateway" ? "success" : "accent"}>{e.type}</Chip>
                    </td>
                    <td className="px-3 py-2">
                      <StateChip state={e.state} />
                    </td>
                    <td className="px-3 py-2">{e.type === "Interface" ? <Chip tone={e.privateDns ? "success" : "muted"}>{e.privateDns ? "on" : "off"}</Chip> : "—"}</td>
                    <td className="px-3 py-2 text-(--text-secondary)">
                      {e.type === "Gateway" ? plural(e.routeTableIds.length, "route table") : plural(e.subnetIds.length, "subnet")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ConsoleLink href={consoleUrl(region, "endpoint", e.id)} label="" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section>
        <SectionTitle>Links to other networks</SectionTitle>
        {vpc.peerings.length + vpc.tgwAttachments.length + vpc.vpnGateways.length === 0 ? (
          <EmptyState title="Not connected to any other network" hint="No peering, transit gateway attachment or virtual private gateway." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {vpc.peerings.map((p) => (
              <Card key={p.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-(--text-primary)">{p.name || "VPC peering"}</p>
                    <CopyId value={p.id} />
                  </div>
                  <StateChip state={p.status} />
                </div>
                <dl className="mt-2 divide-y divide-(--border-hairline)">
                  <Field label="Peer VPC">
                    <span className={mono}>{p.peerVpcId}</span>
                  </Field>
                  <Field label="Peer CIDR">
                    <span className={mono}>{p.peerCidrs.join(", ")}</span>
                  </Field>
                  <Field label="Peer account · region">
                    <span className={mono}>
                      {p.peerOwner} · {p.peerRegion}
                    </span>
                  </Field>
                  <Field label="This VPC is the">{p.role}</Field>
                </dl>
                <div className="mt-2 text-right">
                  <ConsoleLink href={consoleUrl(region, "peering", p.id)} />
                </div>
              </Card>
            ))}
            {vpc.tgwAttachments.map((a) => (
              <Card key={a.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-(--text-primary)">Transit gateway attachment</p>
                    <CopyId value={a.id} />
                  </div>
                  <StateChip state={a.state} />
                </div>
                <dl className="mt-2 divide-y divide-(--border-hairline)">
                  <Field label="Transit gateway">
                    <span className={mono}>{a.tgwId}</span>
                  </Field>
                  <Field label="Subnets">{a.subnetIds.map(subnetName).join(", ")}</Field>
                </dl>
              </Card>
            ))}
            {vpc.vpnGateways.map((g) => (
              <Card key={g.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-(--text-primary)">Virtual private gateway</p>
                    <CopyId value={g.id} />
                  </div>
                  <StateChip state={g.state} />
                </div>
                <p className="mt-2 text-xs text-(--text-muted)">{g.type}</p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>DNS, DHCP &amp; flow logs</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <p className="text-sm font-semibold text-(--text-primary)">DNS &amp; DHCP</p>
            <dl className="mt-2 divide-y divide-(--border-hairline)">
              <Field label="DNS resolution">
                <Chip tone={vpc.dnsSupport ? "success" : "muted"}>{vpc.dnsSupport ? "on" : "off"}</Chip>
              </Field>
              <Field label="DNS hostnames">
                <Chip tone={vpc.dnsHostnames ? "success" : "muted"}>{vpc.dnsHostnames ? "on" : "off"}</Chip>
              </Field>
              {vpc.dhcp && (
                <>
                  <Field label="DHCP options set">
                    <CopyId value={vpc.dhcp.id} />
                  </Field>
                  {Object.entries(vpc.dhcp.options).map(([k, v]) => (
                    <Field key={k} label={k}>
                      <span className={mono}>{v.join(", ")}</span>
                    </Field>
                  ))}
                </>
              )}
            </dl>
          </Card>
          <Card>
            <p className="text-sm font-semibold text-(--text-primary)">Flow logs</p>
            {vpc.flowLogs === null ? (
              <p className="mt-2 text-xs text-(--text-muted)">Could not be read — the credentials lack ec2:DescribeFlowLogs.</p>
            ) : vpc.flowLogs.length === 0 ? (
              <p className="mt-2 text-xs text-(--warn)">Not enabled. You will not be able to see accepted/rejected traffic for this VPC.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {vpc.flowLogs.map((f) => (
                  <li key={f.id} className="text-xs">
                    <div className="flex items-center justify-between">
                      <CopyId value={f.id} />
                      <StateChip state={f.status === "ACTIVE" ? "active" : f.status} />
                    </div>
                    <p className="mt-0.5 truncate text-(--text-muted)">
                      {f.trafficType} → <span className={mono}>{f.destination}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}
