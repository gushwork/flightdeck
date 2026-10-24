"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { intToIp, ipToInt, parseCidr } from "@/lib/vpc/cidr";
import { consoleUrl } from "@/lib/vpc/links";
import { describeTarget, resolveRoute } from "@/lib/vpc/routing";
import type { VpcDetail } from "@/lib/vpc/types";
import { Card, Chip, ConsoleLink, CopyId, EmptyState, SectionTitle, StateChip, focusRing, inputClass, mono } from "./ui";

interface Props {
  vpc: VpcDetail;
  region: string;
  initialFrom?: string;
}

function Step({ label, value, tone = "muted" }: { label: string; value: React.ReactNode; tone?: "success" | "accent" | "warn" | "danger" | "muted" }) {
  const border = {
    success: "border-(--success)/30 bg-(--success-muted)",
    accent: "border-(--accent)/30 bg-(--accent-muted)",
    warn: "border-(--warn)/30 bg-(--warn-muted)",
    danger: "border-(--danger)/30 bg-(--danger-muted)",
    muted: "border-(--border-hairline) bg-(--bg-field)",
  }[tone];
  return (
    <div className={cn("vpc-pop min-w-0 rounded-xl border px-3 py-2", border)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-(--text-muted)">{label}</p>
      <p className={`mt-0.5 truncate text-xs text-(--text-primary) ${mono}`}>{value}</p>
    </div>
  );
}

const Arrow = () => <div className="vpc-flow w-6 shrink-0 self-center" aria-hidden />;

export function RoutingView({ vpc, region, initialFrom }: Props) {
  const [from, setFrom] = useState(
    vpc.subnets.find((s) => s.id === initialFrom)?.id ?? vpc.subnets[0]?.id ?? "",
  );
  const [dest, setDest] = useState("8.8.8.8");

  const subnet = vpc.subnets.find((s) => s.id === from);
  const table = vpc.routeTables.find((t) => t.id === subnet?.routeTableId);
  const resolution = useMemo(() => (table ? resolveRoute(table.routes, dest) : null), [table, dest]);
  const winner = resolution?.winner;
  const winnerInfo = winner ? describeTarget(winner.target) : null;
  const destInt = ipToInt(dest);

  const presets = [
    { label: "Internet", ip: "8.8.8.8" },
    { label: "Inside VPC", ip: intToIp((parseCidr(vpc.cidr)?.base ?? 0) + 10) },
    ...vpc.peerings.flatMap((p) =>
      p.peerCidrs.slice(0, 1).map((c) => ({ label: `Peer ${p.peerVpcId.slice(0, 12)}`, ip: intToIp((parseCidr(c)?.base ?? 0) + 10) })),
    ),
    { label: "Metadata", ip: "169.254.169.254" },
  ];

  let verdict = "";
  let tone: "success" | "accent" | "warn" | "danger" | "muted" = "muted";
  if (resolution?.linkLocal) {
    verdict = "Link-local address: handled by the instance's hypervisor (metadata, DNS, time sync). Route tables are not consulted.";
  } else if (resolution && !winner) {
    verdict = "No route matches, so this traffic is dropped.";
    tone = "danger";
  } else if (winner && winner.state === "blackhole") {
    verdict = `Matched ${winner.destination} but its target no longer exists (blackhole). Traffic is dropped.`;
    tone = "danger";
  } else if (winnerInfo && winner) {
    const kind = winnerInfo.kind;
    tone = winnerInfo.tone === "muted" ? "success" : winnerInfo.tone;
    verdict =
      kind === "local"
        ? "Stays inside the VPC. Security groups and network ACLs still apply."
        : kind === "internet"
          ? "Goes out through the internet gateway. The source also needs a public or Elastic IP."
          : kind === "nat"
            ? "Goes out through the NAT gateway. Replies return, but nothing on the internet can start a connection in."
            : kind === "endpoint"
              ? "Reaches an AWS service over the AWS network via a gateway endpoint — no internet needed."
              : kind === "peering"
                ? "Crosses the VPC peering connection. The peer's route table and security groups must allow it too."
                : kind === "transit"
                  ? "Forwarded to the transit gateway, whose route tables decide what happens next."
                  : kind === "vpn"
                    ? "Sent over the VPN / Direct Connect virtual private gateway."
                    : kind === "egress-igw"
                      ? "IPv6-only egress path (does not apply to IPv4 addresses)."
                      : "Forwarded to an appliance; check what that instance does with it.";
    tone = kind === "internet" ? "success" : tone;
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <SectionTitle>Route tester</SectionTitle>
        <p className="-mt-2 text-xs text-(--text-muted)">
          Pick a source subnet and a destination IP to see which route wins (longest prefix match) and where the traffic ends up.
        </p>
        {vpc.subnets.length === 0 ? (
          <EmptyState title="No subnets to test from" />
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-(--text-muted)">
                From subnet
                <select value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} mt-1 block w-64`}>
                  {vpc.subnets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {(s.name || s.id) + ` · ${s.az.slice(-2)} · ${s.tier}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-(--text-muted)">
                To IPv4 address
                <input
                  value={dest}
                  onChange={(e) => setDest(e.target.value)}
                  spellCheck={false}
                  aria-invalid={destInt === null}
                  className={cn(inputClass, mono, "mt-1 block w-48", destInt === null && "border-(--danger)/50")}
                />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setDest(p.ip)}
                    className={cn(
                      "rounded-lg border border-(--border) bg-(--bg-surface) px-2.5 py-1 text-xs text-(--text-secondary) hover:border-(--accent)/50 hover:text-(--accent)",
                      focusRing,
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {destInt === null ? (
              <p className="text-xs text-(--danger)">Enter a valid IPv4 address, e.g. 10.0.1.25</p>
            ) : (
              resolution && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-stretch gap-2">
                    <Step label="Source" value={`${subnet?.name || subnet?.id} · ${subnet?.cidr}`} />
                    <Arrow />
                    <Step label="Route table" value={table?.id ?? "—"} />
                    <Arrow />
                    <Step
                      label="Winning route"
                      value={resolution.linkLocal ? "not consulted" : winner ? `${winner.destination} → ${winner.target}` : "none"}
                      tone={resolution.linkLocal ? "muted" : winner ? (winner.state === "blackhole" ? "danger" : "accent") : "danger"}
                    />
                    <Arrow />
                    <Step label="Outcome" value={winnerInfo?.label ?? (resolution.linkLocal ? "Handled locally" : "Dropped")} tone={tone} />
                  </div>
                  <p className={cn("rounded-lg border px-3 py-2 text-xs", {
                    "border-(--danger)/20 bg-(--danger-muted) text-(--danger)": tone === "danger",
                    "border-(--border-hairline) bg-(--bg-field) text-(--text-secondary)": tone !== "danger",
                  })}>
                    {verdict}
                  </p>
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-(--text-secondary) hover:text-(--accent)">
                      Every route considered, most specific first
                    </summary>
                    <ul className={`mt-2 space-y-1 text-[11px] ${mono}`}>
                      {resolution.considered.map((c) => (
                        <li
                          key={`${c.route.destination}-${c.route.target}`}
                          className={cn(
                            "flex items-center justify-between gap-3 rounded-lg px-2 py-1",
                            c.route === winner && "bg-(--accent-muted) text-(--accent)",
                            !c.matches && "text-(--text-faint)",
                          )}
                        >
                          <span>
                            {c.route.destination} → {c.route.target}
                          </span>
                          <span className="font-sans">
                            {c.route === winner ? "winner" : c.matches ? "matches, less specific" : c.evaluated ? "no match" : "not evaluated"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              )
            )}
          </>
        )}
      </Card>

      <div>
        <SectionTitle>Route tables ({vpc.routeTables.length})</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          {vpc.routeTables.map((rt) => (
            <Card key={rt.id} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-(--text-primary)">{rt.name || rt.id}</p>
                  <CopyId value={rt.id} />
                </div>
                <div className="flex items-center gap-1.5">
                  {rt.main && <Chip tone="accent">Main</Chip>}
                  <ConsoleLink href={consoleUrl(region, "route-table", rt.id)} label="" />
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {rt.subnetIds.length === 0 ? (
                  <span className="text-xs text-(--text-muted)">
                    {rt.main ? "Applies to every subnet without its own association" : "Not associated with any subnet"}
                  </span>
                ) : (
                  rt.subnetIds.map((id) => (
                    <Chip key={id}>{vpc.subnets.find((s) => s.id === id)?.name || id}</Chip>
                  ))
                )}
              </div>
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="text-(--text-muted)">
                    <th className="py-1 font-medium">Destination</th>
                    <th className="py-1 font-medium">Target</th>
                    <th className="py-1 font-medium">State</th>
                  </tr>
                </thead>
                <tbody className={mono}>
                  {rt.routes.map((r) => (
                    <tr key={`${r.destination}-${r.target}`} className="border-t border-(--border-hairline)">
                      <td className="py-1 text-(--text-secondary)">{r.destination}</td>
                      <td className="py-1">
                        <Chip tone={r.state === "blackhole" ? "danger" : describeTarget(r.target).tone} title={describeTarget(r.target).label}>
                          {r.target}
                        </Chip>
                      </td>
                      <td className="py-1">
                        <StateChip state={r.state} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

