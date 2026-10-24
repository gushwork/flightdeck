import { KIND_LABEL, buildResourceRows } from "@/lib/vpc/resources";
import type { VpcDetail } from "@/lib/vpc/types";

/** Plain-text VPC summary, handy for tickets and design docs. */
export function vpcToMarkdown(vpc: VpcDetail, region: string): string {
  const lines = [
    `# ${vpc.name || vpc.id}`,
    "",
    `- **ID:** ${vpc.id}  ·  **Region:** ${region}  ·  **Account:** ${vpc.ownerId}`,
    `- **CIDRs:** ${vpc.cidrs.map((c) => c.cidr).join(", ")}`,
    `- **DNS:** resolution ${vpc.dnsSupport ? "on" : "off"}, hostnames ${vpc.dnsHostnames ? "on" : "off"}`,
    `- **Internet gateway:** ${vpc.internetGatewayId ?? "none"}`,
    `- **Design health:** ${vpc.score}/100 (${vpc.findings.length} findings)`,
    "",
    "## Subnets",
    "",
    "| Name | CIDR | AZ | Tier | IPs free | Route table |",
    "|---|---|---|---|---|---|",
    ...vpc.subnets.map(
      (s) =>
        `| ${s.name || s.id} | ${s.cidr} | ${s.az} | ${s.tier} | ${s.availableIps}/${s.totalIps} | ${s.routeTableId ?? "—"} |`,
    ),
    "",
    "## Resources",
    "",
    ...buildResourceRows(vpc).map((r) => `- ${KIND_LABEL[r.kind]}: ${r.name} (${r.id}) — ${r.state}`),
  ];
  if (vpc.findings.length > 0) {
    lines.push("", "## Findings", "", ...vpc.findings.map((f) => `- [${f.severity}] ${f.title}`));
  }
  return lines.join("\n");
}

export function downloadText(filename: string, text: string, mime = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
