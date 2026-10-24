/** Client-safe DTOs for the VPC dashboard. */

export type VpcViewId =
  | "topology"
  | "resources"
  | "load-balancers"
  | "subnets"
  | "routing"
  | "security"
  | "connectivity"
  | "planner"
  | "review";

/** public = default route to an IGW; private = default route elsewhere (NAT, TGW…); isolated = no default route. */
export type SubnetTier = "public" | "private" | "isolated";

export type ResourceKind =
  | "instance"
  | "nat-gateway"
  | "load-balancer"
  | "database"
  | "lambda"
  | "cache"
  | "container"
  | "endpoint"
  | "internet-gateway"
  | "egress-igw"
  | "vpn-gateway"
  | "tgw-attachment"
  | "peering"
  | "network-interface"
  | "other";

export interface VpcCidr {
  cidr: string;
  kind: "ipv4" | "ipv6";
  state: string;
  primary: boolean;
}

export interface VpcRoute {
  destination: string;
  target: string;
  state: string;
  origin: string;
}

export interface VpcRouteTable {
  id: string;
  name: string;
  main: boolean;
  routes: VpcRoute[];
  subnetIds: string[];
}

export interface VpcSubnet {
  id: string;
  name: string;
  cidr: string;
  ipv6Cidrs: string[];
  az: string;
  azId: string;
  state: string;
  /** Usable addresses (AWS reserves 5 per subnet). */
  totalIps: number;
  availableIps: number;
  mapPublicIpOnLaunch: boolean;
  defaultForAz: boolean;
  /** Effective route table (explicit association, else the VPC main table). */
  routeTableId?: string;
  networkAclId?: string;
  tier: SubnetTier;
  /** Target of the default route (igw-…, nat-…, tgw-…), if any. */
  egressTarget?: string;
  eniCount: number;
  instanceCount: number;
  natGatewayIds: string[];
  tags: Record<string, string>;
}

export interface VpcNatGateway {
  id: string;
  name: string;
  subnetId: string;
  az: string;
  state: string;
  connectivity: "public" | "private";
  publicIp?: string;
  privateIp?: string;
}

export interface VpcEndpoint {
  id: string;
  service: string;
  type: string;
  state: string;
  privateDns: boolean;
  subnetIds: string[];
  routeTableIds: string[];
}

export interface VpcInstance {
  id: string;
  name: string;
  type: string;
  state: string;
  az: string;
  subnetId: string;
  privateIp?: string;
  publicIp?: string;
  securityGroupIds: string[];
  iamProfile?: string;
  launchTime?: string;
}

export interface VpcEni {
  id: string;
  description: string;
  subnetId: string;
  az: string;
  status: string;
  privateIps: string[];
  publicIp?: string;
  securityGroupIds: string[];
  attachedInstanceId?: string;
  requesterManaged: boolean;
  kind: ResourceKind;
  /** Human label for the owning service, e.g. "ALB my-app". */
  label: string;
  /** Stable key so multi-ENI services (load balancers) collapse into one row. */
  group: string;
}

export interface SgRule {
  protocol: string;
  ports: string;
  source: string;
  sourceKind: "cidr" | "sg" | "prefix-list";
  description?: string;
}

export interface VpcSecurityGroup {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  inbound: SgRule[];
  outbound: SgRule[];
  eniCount: number;
  /** Other security groups whose rules reference this one. */
  referencedBy: string[];
}

export interface AclEntry {
  rule: string;
  protocol: string;
  ports: string;
  cidr: string;
  action: "allow" | "deny";
}

export interface VpcNetworkAcl {
  id: string;
  name: string;
  isDefault: boolean;
  subnetIds: string[];
  inbound: AclEntry[];
  outbound: AclEntry[];
}

export interface VpcPeering {
  id: string;
  name: string;
  status: string;
  role: "requester" | "accepter";
  peerVpcId: string;
  peerCidrs: string[];
  peerOwner: string;
  peerRegion: string;
}

export interface VpcTgwAttachment {
  id: string;
  tgwId: string;
  state: string;
  subnetIds: string[];
}

export interface VpcVpnGateway {
  id: string;
  state: string;
  type: string;
}

export interface VpcEgressIgw {
  id: string;
  state: string;
}

export interface VpcFlowLog {
  id: string;
  status: string;
  trafficType: string;
  destination: string;
}

export interface VpcDhcp {
  id: string;
  options: Record<string, string[]>;
}

export interface LbTarget {
  id: string;
  port?: number;
  az?: string;
  /** healthy | unhealthy | initial | draining | unused | unavailable */
  health: string;
  reason?: string;
}

export interface LbTargetGroup {
  arn: string;
  name: string;
  protocol: string;
  port?: number;
  targetType: string;
  healthCheck: string;
  targets: LbTarget[];
}

export interface LbRule {
  priority: string;
  conditions: string[];
  action: string;
  targetGroupArns: string[];
}

export interface LbListener {
  arn: string;
  protocol: string;
  port?: number;
  /** Default action in words, e.g. "forward → web-tg" or "redirect 301 → HTTPS:443". */
  action: string;
  actionType: string;
  targetGroupArns: string[];
  rules: LbRule[];
  certificates: number;
  sslPolicy?: string;
}

export type LbType = "application" | "network" | "gateway";

export interface VpcLoadBalancer {
  arn: string;
  name: string;
  type: LbType;
  scheme: "internet-facing" | "internal";
  state: string;
  dnsName: string;
  ipType: string;
  subnetIds: string[];
  azs: string[];
  securityGroupIds: string[];
  createdAt?: string;
  listeners: LbListener[];
  targetGroups: LbTargetGroup[];
}

export type VpcServiceKind = "database" | "lambda" | "cache" | "container";

/** RDS instance, Lambda function, ElastiCache cluster or ECS service placed in the VPC. */
export interface VpcService {
  kind: VpcServiceKind;
  id: string;
  name: string;
  state: string;
  subnetIds: string[];
  securityGroupIds: string[];
  endpoint?: string;
  attributes: [string, string][];
  consoleUrl: string;
  facts: {
    publiclyAccessible?: boolean;
    encrypted?: boolean;
    multiAz?: boolean;
    clusterMember?: boolean;
    transitEncryption?: boolean;
    desired?: number;
    running?: number;
  };
}

/** Which service APIs answered; false = fell back to guessing from network interfaces. */
export interface VpcCoverage {
  loadBalancers: boolean;
  database: boolean;
  lambda: boolean;
  cache: boolean;
  container: boolean;
}

export type FindingSeverity = "high" | "medium" | "low" | "info";

export interface VpcFinding {
  id: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  fix?: string;
  resourceIds: string[];
  view: VpcViewId;
}

export interface VpcDetail {
  id: string;
  name: string;
  ownerId: string;
  /** Primary IPv4 CIDR. */
  cidr: string;
  cidrs: VpcCidr[];
  isDefault: boolean;
  state: string;
  tenancy: string;
  dnsSupport: boolean;
  dnsHostnames: boolean;
  tags: Record<string, string>;
  internetGatewayId?: string;
  egressOnlyIgws: VpcEgressIgw[];
  subnets: VpcSubnet[];
  routeTables: VpcRouteTable[];
  natGateways: VpcNatGateway[];
  endpoints: VpcEndpoint[];
  instances: VpcInstance[];
  enis: VpcEni[];
  securityGroups: VpcSecurityGroup[];
  networkAcls: VpcNetworkAcl[];
  peerings: VpcPeering[];
  tgwAttachments: VpcTgwAttachment[];
  vpnGateways: VpcVpnGateway[];
  /** null = could not be read (missing permission), [] = none configured. */
  flowLogs: VpcFlowLog[] | null;
  dhcp?: VpcDhcp;
  loadBalancers: VpcLoadBalancer[];
  services: VpcService[];
  coverage: VpcCoverage;
  findings: VpcFinding[];
  /** 0–100 design-health score derived from findings. */
  score: number;
}

export interface VpcOverviewResponse {
  vpcs: VpcDetail[];
  /** Optional calls that failed (usually missing IAM permissions). */
  warnings: string[];
  /** Slow lookups still loading server-side; ask again shortly to get them. */
  pending: string[];
}
