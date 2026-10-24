import {
  EC2Client,
  DescribeDhcpOptionsCommand,
  DescribeVpcAttributeCommand,
  DescribeVpnGatewaysCommand,
  paginateDescribeEgressOnlyInternetGateways,
  paginateDescribeFlowLogs,
  paginateDescribeInstances,
  paginateDescribeInternetGateways,
  paginateDescribeNatGateways,
  paginateDescribeNetworkAcls,
  paginateDescribeNetworkInterfaces,
  paginateDescribeRouteTables,
  paginateDescribeSecurityGroups,
  paginateDescribeSubnets,
  paginateDescribeTransitGatewayVpcAttachments,
  paginateDescribeVpcEndpoints,
  paginateDescribeVpcPeeringConnections,
  paginateDescribeVpcs,
  type IpPermission,
  type Tag,
  type VpcPeeringConnectionVpcInfo,
} from "@aws-sdk/client-ec2";
import { awsClientOptions } from "@/lib/aws/client";
import { drain, fetchVpcServices, optional } from "@/lib/aws/vpc-services";
import { awsUsableIps, parseCidr } from "@/lib/vpc/cidr";
import { classifyEni } from "@/lib/vpc/eni";
import { reviewVpc, scoreOf, type VpcReviewInput } from "@/lib/vpc/review";
import { classifyTier } from "@/lib/vpc/routing";
import type {
  AclEntry,
  SgRule,
  VpcDetail,
  VpcOverviewResponse,
  VpcRoute,
  VpcRouteTable,
  VpcSubnet,
} from "@/lib/vpc/types";

function getClient(region: string, profile?: string) {
  return new EC2Client(awsClientOptions(region, profile));
}

const nameOf = (tags: Tag[] | undefined) => tags?.find((t) => t.Key === "Name")?.Value ?? "";

function tagMap(tags: Tag[] | undefined): Record<string, string> {
  return Object.fromEntries((tags ?? []).flatMap((t) => (t.Key ? [[t.Key, t.Value ?? ""]] : [])));
}

function portText(from?: number, to?: number, protocol?: string): string {
  if (protocol === "-1" || from === undefined || from === -1) return "All";
  return from === to ? String(from) : `${from}-${to}`;
}

function protocolText(p: string | undefined): string {
  if (!p || p === "-1") return "All";
  return ({ "6": "TCP", "17": "UDP", "1": "ICMP", "58": "ICMPV6" } as Record<string, string>)[p] ?? p.toUpperCase();
}

function sgRules(perms: IpPermission[] | undefined): SgRule[] {
  const rules: SgRule[] = [];
  for (const p of perms ?? []) {
    const base = {
      protocol: protocolText(p.IpProtocol),
      ports: portText(p.FromPort, p.ToPort, p.IpProtocol),
    };
    for (const r of p.IpRanges ?? []) {
      rules.push({ ...base, source: r.CidrIp ?? "", sourceKind: "cidr", description: r.Description });
    }
    for (const r of p.Ipv6Ranges ?? []) {
      rules.push({ ...base, source: r.CidrIpv6 ?? "", sourceKind: "cidr", description: r.Description });
    }
    for (const g of p.UserIdGroupPairs ?? []) {
      rules.push({ ...base, source: g.GroupId ?? "", sourceKind: "sg", description: g.Description });
    }
    for (const l of p.PrefixListIds ?? []) {
      rules.push({ ...base, source: l.PrefixListId ?? "", sourceKind: "prefix-list", description: l.Description });
    }
  }
  return rules;
}

function peerInfo(info: VpcPeeringConnectionVpcInfo | undefined) {
  return {
    vpcId: info?.VpcId ?? "",
    cidrs: (info?.CidrBlockSet?.map((c) => c.CidrBlock) ?? [info?.CidrBlock]).filter((c): c is string => !!c),
    owner: info?.OwnerId ?? "",
    region: info?.Region ?? "",
  };
}

async function dnsAttribute(
  client: EC2Client,
  vpcId: string,
  attribute: "enableDnsSupport" | "enableDnsHostnames",
): Promise<boolean> {
  const res = await client.send(new DescribeVpcAttributeCommand({ VpcId: vpcId, Attribute: attribute }));
  return (attribute === "enableDnsSupport" ? res.EnableDnsSupport : res.EnableDnsHostnames)?.Value ?? false;
}

export async function listVpcs(region: string, profile?: string): Promise<VpcOverviewResponse> {
  const client = getClient(region, profile);
  const warnings: string[] = [];
  const none = <T,>() => [] as T[];

  // VPCs, subnets and route tables are the backbone; everything else is best-effort.
  const [vpcs, subnets, routeTables] = await Promise.all([
    drain(paginateDescribeVpcs({ client }, {}), (p) => p.Vpcs),
    drain(paginateDescribeSubnets({ client }, {}), (p) => p.Subnets),
    drain(paginateDescribeRouteTables({ client }, {}), (p) => p.RouteTables),
  ]);

  const subnetVpc = new Map(subnets.map((s) => [s.SubnetId ?? "", s.VpcId ?? ""]));
  const servicesPromise = fetchVpcServices(region, profile, subnetVpc, warnings);

  const [igws, nats, endpoints, instances, enis, sgs, nacls, peerings, tgwAttachments, vgws, eigws, flowLogs, dhcpOptions] =
    await Promise.all([
      optional("Internet gateways", drain(paginateDescribeInternetGateways({ client }, {}), (p) => p.InternetGateways), none<never>(), warnings),
      optional("NAT gateways", drain(paginateDescribeNatGateways({ client }, {}), (p) => p.NatGateways), none<never>(), warnings),
      optional("VPC endpoints", drain(paginateDescribeVpcEndpoints({ client }, {}), (p) => p.VpcEndpoints), none<never>(), warnings),
      optional(
        "EC2 instances",
        drain(
          paginateDescribeInstances(
            { client },
            { Filters: [{ Name: "instance-state-name", Values: ["pending", "running", "stopping", "stopped"] }] },
          ),
          (p) => p.Reservations?.flatMap((r) => r.Instances ?? []),
        ),
        none<never>(),
        warnings,
      ),
      optional("Network interfaces", drain(paginateDescribeNetworkInterfaces({ client }, {}), (p) => p.NetworkInterfaces), none<never>(), warnings),
      optional("Security groups", drain(paginateDescribeSecurityGroups({ client }, {}), (p) => p.SecurityGroups), none<never>(), warnings),
      optional("Network ACLs", drain(paginateDescribeNetworkAcls({ client }, {}), (p) => p.NetworkAcls), none<never>(), warnings),
      optional("VPC peering", drain(paginateDescribeVpcPeeringConnections({ client }, {}), (p) => p.VpcPeeringConnections), none<never>(), warnings),
      optional(
        "Transit gateway attachments",
        drain(paginateDescribeTransitGatewayVpcAttachments({ client }, {}), (p) => p.TransitGatewayVpcAttachments),
        none<never>(),
        warnings,
      ),
      optional("VPN gateways", client.send(new DescribeVpnGatewaysCommand({})).then((r) => r.VpnGateways ?? []), none<never>(), warnings),
      optional(
        "Egress-only gateways",
        drain(paginateDescribeEgressOnlyInternetGateways({ client }, {}), (p) => p.EgressOnlyInternetGateways),
        none<never>(),
        warnings,
      ),
      optional("Flow logs", drain(paginateDescribeFlowLogs({ client }, {}), (p) => p.FlowLogs), null, warnings),
      optional("DHCP options", client.send(new DescribeDhcpOptionsCommand({})).then((r) => r.DhcpOptions ?? []), none<never>(), warnings),
    ]);

  const subnetAz = new Map(subnets.map((s) => [s.SubnetId ?? "", s.AvailabilityZone ?? ""]));

  const extra = await servicesPromise;

  const sgIdsReferencing = new Map<string, Set<string>>();
  for (const sg of sgs) {
    for (const rule of [...sgRules(sg.IpPermissions), ...sgRules(sg.IpPermissionsEgress)]) {
      if (rule.sourceKind !== "sg" || !sg.GroupId || rule.source === sg.GroupId) continue;
      sgIdsReferencing.set(rule.source, (sgIdsReferencing.get(rule.source) ?? new Set()).add(sg.GroupId));
    }
  }

  const details = await Promise.all(
    vpcs.map(async (vpc): Promise<VpcReviewInput> => {
      const vpcId = vpc.VpcId ?? "";
      const [dnsSupport, dnsHostnames] = await Promise.all([
        dnsAttribute(client, vpcId, "enableDnsSupport").catch(() => false),
        dnsAttribute(client, vpcId, "enableDnsHostnames").catch(() => false),
      ]);

      const vpcEnis = enis
        .filter((e) => e.VpcId === vpcId)
        .map((e) => {
          const cls = classifyEni({
            id: e.NetworkInterfaceId ?? "",
            description: e.Description,
            interfaceType: e.InterfaceType,
            attachedInstanceId: e.Attachment?.InstanceId,
            status: e.Status,
          });
          return {
            id: e.NetworkInterfaceId ?? "",
            description: e.Description ?? "",
            subnetId: e.SubnetId ?? "",
            az: e.AvailabilityZone ?? "",
            status: e.Status ?? "",
            privateIps: (e.PrivateIpAddresses ?? []).map((a) => a.PrivateIpAddress).filter((x): x is string => !!x),
            publicIp: e.Association?.PublicIp,
            securityGroupIds: (e.Groups ?? []).map((g) => g.GroupId).filter((x): x is string => !!x),
            attachedInstanceId: e.Attachment?.InstanceId,
            requesterManaged: e.RequesterManaged ?? false,
            kind: cls.kind,
            label: cls.label,
            group: cls.group,
          };
        });

      const vpcNats = nats
        .filter((n) => n.VpcId === vpcId && n.State !== "deleted")
        .map((n) => ({
          id: n.NatGatewayId ?? "",
          name: nameOf(n.Tags),
          subnetId: n.SubnetId ?? "",
          az: subnetAz.get(n.SubnetId ?? "") ?? "",
          state: n.State ?? "unknown",
          connectivity: (n.ConnectivityType === "private" ? "private" : "public") as "public" | "private",
          publicIp: n.NatGatewayAddresses?.[0]?.PublicIp,
          privateIp: n.NatGatewayAddresses?.[0]?.PrivateIp,
        }));

      const tables: VpcRouteTable[] = routeTables
        .filter((rt) => rt.VpcId === vpcId)
        .map((rt) => ({
          id: rt.RouteTableId ?? "",
          name: nameOf(rt.Tags),
          main: rt.Associations?.some((a) => a.Main) ?? false,
          subnetIds: (rt.Associations ?? []).map((a) => a.SubnetId).filter((id): id is string => !!id),
          routes: (rt.Routes ?? []).map(
            (r): VpcRoute => ({
              destination: r.DestinationCidrBlock ?? r.DestinationIpv6CidrBlock ?? r.DestinationPrefixListId ?? "—",
              target:
                r.GatewayId ??
                r.NatGatewayId ??
                r.TransitGatewayId ??
                r.VpcPeeringConnectionId ??
                r.EgressOnlyInternetGatewayId ??
                r.NetworkInterfaceId ??
                r.InstanceId ??
                "—",
              state: r.State ?? "active",
              origin: r.Origin ?? "",
            }),
          ),
        }));
      const mainTable = tables.find((t) => t.main);
      const vpcAcls = nacls.filter((a) => a.VpcId === vpcId);

      const vpcSubnets: VpcSubnet[] = subnets
        .filter((s) => s.VpcId === vpcId)
        .map((s) => {
          const id = s.SubnetId ?? "";
          const table = tables.find((t) => t.subnetIds.includes(id)) ?? mainTable;
          const { tier, egress } = classifyTier(table?.routes ?? []);
          const prefix = parseCidr(s.CidrBlock ?? "")?.prefix ?? 24;
          return {
            id,
            name: nameOf(s.Tags),
            cidr: s.CidrBlock ?? "",
            ipv6Cidrs: (s.Ipv6CidrBlockAssociationSet ?? []).map((a) => a.Ipv6CidrBlock).filter((x): x is string => !!x),
            az: s.AvailabilityZone ?? "",
            azId: s.AvailabilityZoneId ?? "",
            state: s.State ?? "unknown",
            totalIps: awsUsableIps(prefix),
            availableIps: s.AvailableIpAddressCount ?? 0,
            mapPublicIpOnLaunch: s.MapPublicIpOnLaunch ?? false,
            defaultForAz: s.DefaultForAz ?? false,
            routeTableId: table?.id,
            networkAclId: vpcAcls.find((a) => a.Associations?.some((x) => x.SubnetId === id))?.NetworkAclId,
            tier,
            egressTarget: egress,
            eniCount: vpcEnis.filter((e) => e.subnetId === id).length,
            instanceCount: instances.filter((i) => i.SubnetId === id).length,
            natGatewayIds: vpcNats.filter((n) => n.subnetId === id).map((n) => n.id),
            tags: tagMap(s.Tags),
          };
        })
        .sort((a, b) => a.az.localeCompare(b.az) || a.cidr.localeCompare(b.cidr));

      const vpcSgs = sgs
        .filter((g) => g.VpcId === vpcId)
        .map((g) => ({
          id: g.GroupId ?? "",
          name: g.GroupName ?? "",
          description: g.Description ?? "",
          isDefault: g.GroupName === "default",
          inbound: sgRules(g.IpPermissions),
          outbound: sgRules(g.IpPermissionsEgress),
          eniCount: vpcEnis.filter((e) => e.securityGroupIds.includes(g.GroupId ?? "")).length,
          referencedBy: [...(sgIdsReferencing.get(g.GroupId ?? "") ?? [])],
        }));

      const toAclEntries = (entries: typeof vpcAcls[number]["Entries"], egress: boolean): AclEntry[] =>
        (entries ?? [])
          .filter((e) => (e.Egress ?? false) === egress)
          .sort((a, b) => (a.RuleNumber ?? 0) - (b.RuleNumber ?? 0))
          .map((e) => ({
            rule: e.RuleNumber === 32767 ? "*" : String(e.RuleNumber ?? ""),
            protocol: protocolText(e.Protocol),
            ports: e.PortRange ? portText(e.PortRange.From, e.PortRange.To) : "All",
            cidr: e.CidrBlock ?? e.Ipv6CidrBlock ?? "",
            action: e.RuleAction === "deny" ? "deny" : "allow",
          }));

      const dhcpId = vpc.DhcpOptionsId;
      const dhcp = dhcpOptions.find((d) => d.DhcpOptionsId === dhcpId);
      const primary = vpc.CidrBlock ?? "";

      return {
        id: vpcId,
        name: nameOf(vpc.Tags),
        ownerId: vpc.OwnerId ?? "",
        cidr: primary,
        cidrs: [
          ...(vpc.CidrBlockAssociationSet ?? []).map((c) => ({
            cidr: c.CidrBlock ?? "",
            kind: "ipv4" as const,
            state: c.CidrBlockState?.State ?? "",
            primary: c.CidrBlock === primary,
          })),
          ...(vpc.Ipv6CidrBlockAssociationSet ?? []).map((c) => ({
            cidr: c.Ipv6CidrBlock ?? "",
            kind: "ipv6" as const,
            state: c.Ipv6CidrBlockState?.State ?? "",
            primary: false,
          })),
        ],
        isDefault: vpc.IsDefault ?? false,
        state: vpc.State ?? "unknown",
        tenancy: vpc.InstanceTenancy ?? "default",
        dnsSupport,
        dnsHostnames,
        tags: tagMap(vpc.Tags),
        internetGatewayId: igws.find((g) => g.Attachments?.some((a) => a.VpcId === vpcId))?.InternetGatewayId,
        egressOnlyIgws: eigws
          .filter((g) => g.Attachments?.some((a) => a.VpcId === vpcId))
          .map((g) => ({ id: g.EgressOnlyInternetGatewayId ?? "", state: g.Attachments?.[0]?.State ?? "" })),
        subnets: vpcSubnets,
        routeTables: tables,
        natGateways: vpcNats,
        endpoints: endpoints
          .filter((e) => e.VpcId === vpcId)
          .map((e) => ({
            id: e.VpcEndpointId ?? "",
            service: e.ServiceName ?? "",
            type: e.VpcEndpointType ?? "",
            state: e.State ?? "",
            privateDns: e.PrivateDnsEnabled ?? false,
            subnetIds: e.SubnetIds ?? [],
            routeTableIds: e.RouteTableIds ?? [],
          })),
        instances: instances
          .filter((i) => i.VpcId === vpcId)
          .map((i) => ({
            id: i.InstanceId ?? "",
            name: nameOf(i.Tags),
            type: i.InstanceType ?? "",
            state: i.State?.Name ?? "",
            az: i.Placement?.AvailabilityZone ?? "",
            subnetId: i.SubnetId ?? "",
            privateIp: i.PrivateIpAddress,
            publicIp: i.PublicIpAddress,
            securityGroupIds: (i.SecurityGroups ?? []).map((g) => g.GroupId).filter((x): x is string => !!x),
            iamProfile: i.IamInstanceProfile?.Arn,
            launchTime: i.LaunchTime?.toISOString(),
          })),
        enis: vpcEnis,
        securityGroups: vpcSgs,
        networkAcls: vpcAcls.map((a) => ({
          id: a.NetworkAclId ?? "",
          name: nameOf(a.Tags),
          isDefault: a.IsDefault ?? false,
          subnetIds: (a.Associations ?? []).map((x) => x.SubnetId).filter((x): x is string => !!x),
          inbound: toAclEntries(a.Entries, false),
          outbound: toAclEntries(a.Entries, true),
        })),
        peerings: peerings
          .filter((p) => p.RequesterVpcInfo?.VpcId === vpcId || p.AccepterVpcInfo?.VpcId === vpcId)
          .map((p) => {
            const requester = p.RequesterVpcInfo?.VpcId === vpcId;
            const peer = peerInfo(requester ? p.AccepterVpcInfo : p.RequesterVpcInfo);
            return {
              id: p.VpcPeeringConnectionId ?? "",
              name: nameOf(p.Tags),
              status: p.Status?.Code ?? "",
              role: requester ? ("requester" as const) : ("accepter" as const),
              peerVpcId: peer.vpcId,
              peerCidrs: peer.cidrs,
              peerOwner: peer.owner,
              peerRegion: peer.region,
            };
          }),
        tgwAttachments: tgwAttachments
          .filter((a) => a.VpcId === vpcId)
          .map((a) => ({
            id: a.TransitGatewayAttachmentId ?? "",
            tgwId: a.TransitGatewayId ?? "",
            state: a.State ?? "",
            subnetIds: a.SubnetIds ?? [],
          })),
        vpnGateways: vgws
          .filter((g) => g.VpcAttachments?.some((a) => a.VpcId === vpcId && a.State === "attached"))
          .map((g) => ({ id: g.VpnGatewayId ?? "", state: g.State ?? "", type: g.Type ?? "" })),
        flowLogs:
          flowLogs === null
            ? null
            : flowLogs
                .filter((f) => f.ResourceId === vpcId)
                .map((f) => ({
                  id: f.FlowLogId ?? "",
                  status: f.FlowLogStatus ?? "",
                  trafficType: f.TrafficType ?? "",
                  destination: f.LogDestination ?? f.LogGroupName ?? "",
                })),
        loadBalancers: extra.loadBalancers.filter((lb) => lb.vpcId === vpcId),
        services: extra.services.filter((sv) => sv.vpcId === vpcId),
        coverage: extra.coverage,
        dhcp: dhcp
          ? {
              id: dhcp.DhcpOptionsId ?? "",
              options: Object.fromEntries(
                (dhcp.DhcpConfigurations ?? []).map((c) => [c.Key ?? "", (c.Values ?? []).map((v) => v.Value ?? "")]),
              ),
            }
          : undefined,
      };
    }),
  );

  const out: VpcDetail[] = details
    .map((d) => {
      const findings = reviewVpc(d, details);
      return { ...d, findings, score: scoreOf(findings) };
    })
    .sort((a, b) => Number(a.isDefault) - Number(b.isDefault) || (a.name || a.id).localeCompare(b.name || b.id));

  return { vpcs: out, warnings, pending: extra.pending };
}
