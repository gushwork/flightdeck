export type ConsoleResource =
  | "vpc"
  | "subnet"
  | "route-table"
  | "internet-gateway"
  | "egress-igw"
  | "nat-gateway"
  | "endpoint"
  | "peering"
  | "tgw-attachment"
  | "vpn-gateway"
  | "security-group"
  | "network-acl"
  | "instance"
  | "network-interface"
  | "load-balancer";

/** Deep links into the AWS console (commercial partition). */
export function consoleUrl(region: string, type: ConsoleResource, id: string): string {
  const base = `https://${region}.console.aws.amazon.com`;
  const q = `?region=${region}`;
  const vpc = (hash: string) => `${base}/vpcconsole/home${q}#${hash}`;
  switch (type) {
    case "vpc":
      return vpc(`VpcDetails:VpcId=${id}`);
    case "subnet":
      return vpc(`SubnetDetails:subnetId=${id}`);
    case "route-table":
      return vpc(`RouteTableDetails:RouteTableId=${id}`);
    case "internet-gateway":
      return vpc(`InternetGateway:internetGatewayId=${id}`);
    case "egress-igw":
      return vpc(`EgressOnlyInternetGateways:`);
    case "nat-gateway":
      return vpc(`NatGatewayDetails:natGatewayId=${id}`);
    case "endpoint":
      return vpc(`EndpointDetails:vpcEndpointId=${id}`);
    case "peering":
      return vpc(`PeeringConnectionDetails:vpcPeeringConnectionId=${id}`);
    case "tgw-attachment":
      return vpc(`TransitGatewayAttachments:`);
    case "vpn-gateway":
      return vpc(`VpnGateways:`);
    case "security-group":
      return vpc(`SecurityGroup:securityGroupId=${id}`);
    case "network-acl":
      return vpc(`NetworkAclDetails:networkAclId=${id}`);
    case "instance":
      return `${base}/ec2/home${q}#InstanceDetails:instanceId=${id}`;
    case "load-balancer":
      return `${base}/ec2/home${q}#LoadBalancer:loadBalancerArn=${id}`;
    case "network-interface":
      return `${base}/ec2/home${q}#NetworkInterface:networkInterfaceId=${id}`;
  }
}
