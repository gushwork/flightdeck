"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useBreadcrumbs } from "@/lib/nav/breadcrumb-context";
import { downloadText, vpcToMarkdown } from "@/lib/vpc/export";
import { consoleUrl } from "@/lib/vpc/links";
import { buildResourceRows } from "@/lib/vpc/resources";
import type { VpcViewId } from "@/lib/vpc/types";
import { ConnectivityView } from "./connectivity-view";
import { HealthRing } from "./health-ring";
import { LoadBalancersView } from "./lb-view";
import { PlannerView } from "./planner-view";
import { RefreshControl } from "./refresh-control";
import { ResourceDrawer } from "./resource-drawer";
import { ResourcesView } from "./resources-view";
import { ReviewView } from "./review-view";
import { RoutingView } from "./routing-view";
import { SecurityView } from "./security-view";
import { SubnetsView } from "./subnets-view";
import { TopologyView } from "./topology-view";
import { Card, Chip, ConsoleLink, CopyButton, CopyId, CountUp, GhostButton, Kbd, Skeleton, focusRing, mono } from "./ui";
import { useVpcs } from "./vpc-provider";

const VIEWS: { id: VpcViewId; label: string; hint: string }[] = [
  { id: "topology", label: "Topology", hint: "Subnets by AZ and tier" },
  { id: "resources", label: "Resources", hint: "Everything deployed here" },
  { id: "load-balancers", label: "Load balancers", hint: "Listeners, rules, target health" },
  { id: "subnets", label: "Subnets", hint: "Capacity and placement" },
  { id: "routing", label: "Routing", hint: "Route tables and route tester" },
  { id: "security", label: "Security", hint: "Security groups and NACLs" },
  { id: "connectivity", label: "Connectivity", hint: "Gateways, endpoints, peering" },
  { id: "planner", label: "Planner", hint: "CIDR map and layout helper" },
  { id: "review", label: "Review", hint: "Design health findings" },
];

const SHORTCUTS: [string, string][] = [
  ["1 – 9", "Switch view"],
  ["/", "Focus search"],
  ["r", "Refresh data"],
  ["Esc", "Close details, inspector or help"],
  ["?", "Show this help"],
];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);
}

export function VpcDetailView({ vpcId }: { vpcId: string }) {
  const { vpcs, region, loading, error, warnings, pending, refresh, refreshing, updatedAt } = useVpcs();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [helpOpen, setHelpOpen] = useState(false);

  const vpc = vpcs.find((v) => v.id === vpcId);
  const requested = search.get("view");
  const view: VpcViewId = VIEWS.some((v) => v.id === requested) ? (requested as VpcViewId) : "topology";
  const viewLabel = VIEWS.find((v) => v.id === view)?.label ?? "Topology";

  useBreadcrumbs([
    { label: "VPC", href: "/vpc" },
    { label: vpc?.name || vpcId, href: `/vpc/${encodeURIComponent(vpcId)}` },
    { label: viewLabel },
  ]);

  const replaceParams = useCallback(
    (sp: URLSearchParams) => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }),
    [router, pathname],
  );
  const navigate = useCallback(
    (next: VpcViewId, params: Record<string, string> = {}) => replaceParams(new URLSearchParams({ view: next, ...params })),
    [replaceParams],
  );
  /** Opens the details drawer on top of whatever view is showing. */
  const openResource = useCallback(
    (key: string) => {
      const sp = new URLSearchParams(search.toString());
      sp.set("res", key);
      replaceParams(sp);
    },
    [search, replaceParams],
  );
  const closeResource = useCallback(() => {
    const sp = new URLSearchParams(search.toString());
    sp.delete("res");
    replaceParams(sp);
  }, [search, replaceParams]);

  const rows = useMemo(() => (vpc ? buildResourceRows(vpc) : []), [vpc]);
  const resKey = search.get("res");
  const drawerRow = resKey ? rows.find((r) => r.key === resKey || r.id === resKey) : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "Escape") {
        if (helpOpen) setHelpOpen(false);
        else if (view === "topology" && search.get("select")) navigate("topology");
        return;
      }
      if (drawerRow) return;
      const n = Number(e.key);
      if (n >= 1 && n <= VIEWS.length) navigate(VIEWS[n - 1].id);
      else if (e.key === "/") {
        e.preventDefault();
        window.dispatchEvent(new Event("vpc:focus-search"));
      } else if (e.key === "r") void refresh();
      else if (e.key === "?") setHelpOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerRow, helpOpen, navigate, refresh, search, view]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-1/2" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!vpc) {
    return (
      <Card className="mx-auto max-w-xl space-y-3 text-center">
        <p className="text-sm font-semibold text-(--text-primary)">{error ? "Could not load VPCs" : "VPC not found"}</p>
        <p className="text-xs text-(--text-muted)">
          {error ?? (
            <>
              <span className={mono}>{vpcId}</span> is not in <span className={mono}>{region}</span> for this account. Switch the region or
              account in the top bar, or head back to the list.
            </>
          )}
        </p>
        <Link href="/vpc" className="inline-block text-xs font-medium text-(--accent) hover:underline">
          ← All VPCs
        </Link>
      </Card>
    );
  }

  const services = (kind: string) => vpc.services.filter((s) => s.kind === kind).length;
  const counts: Partial<Record<VpcViewId, number>> = {
    resources: rows.length,
    "load-balancers": vpc.loadBalancers.length,
    subnets: vpc.subnets.length,
    routing: vpc.routeTables.length,
    security: vpc.securityGroups.length,
    connectivity: vpc.natGateways.length + vpc.endpoints.length + vpc.peerings.length + vpc.tgwAttachments.length + vpc.vpnGateways.length,
    review: vpc.findings.filter((f) => f.severity !== "info").length,
  };
  const lambdaPending = pending.includes("Lambda functions");
  const stats: { label: string; value: number | null; view: VpcViewId }[] = [
    { label: "Subnets", value: vpc.subnets.length, view: "subnets" },
    { label: "Instances", value: vpc.instances.length, view: "resources" },
    { label: "Load balancers", value: vpc.loadBalancers.length, view: "load-balancers" },
    { label: "Databases", value: services("database"), view: "resources" },
    { label: "Lambda functions", value: lambdaPending ? null : services("lambda"), view: "resources" },
    { label: "NAT gateways", value: vpc.natGateways.length, view: "connectivity" },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
              AWS · <span className={mono}>{region}</span>
            </p>
            <h1 className="mt-2 flex flex-wrap items-center gap-2 font-(family-name:--font-display) text-2xl font-medium text-(--text-primary)">
              <span className="truncate">{vpc.name || vpc.id}</span>
              <span className="flex items-center gap-1.5 font-(family-name:--font-sans)">
                {vpc.isDefault && <Chip>Default</Chip>}
                <Chip tone={vpc.state === "available" ? "success" : "warn"}>{vpc.state}</Chip>
              </span>
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <CopyId value={vpc.id} />
              {vpc.cidrs.map((c) => (
                <Chip key={c.cidr} tone={c.primary ? "accent" : "muted"} title={c.primary ? "Primary CIDR" : c.kind === "ipv6" ? "IPv6 CIDR" : "Secondary CIDR"}>
                  <span className={mono}>{c.cidr}</span>
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <RefreshControl updatedAt={updatedAt} refreshing={refreshing} onRefresh={() => void refresh()} />
            <CopyButton text={vpcToMarkdown(vpc, region)} label="Copy summary" />
            <GhostButton onClick={() => downloadText(`${vpc.id}.json`, JSON.stringify(vpc, null, 2), "application/json")}>
              Download JSON
            </GhostButton>
            <ConsoleLink href={consoleUrl(region, "vpc", vpc.id)} />
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts  (?)"
              className={cn("rounded-lg border border-(--border) px-2 py-1 text-xs text-(--text-muted) hover:text-(--accent)", focusRing, mono)}
            >
              ?
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {stats.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => navigate(s.view)}
              className={cn(
                "rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-4 py-3 text-left shadow-sm transition-all hover:-translate-y-px hover:border-(--accent)/40",
                focusRing,
              )}
            >
              <p className={`text-2xl font-light tabular-nums text-(--text-primary) ${mono}`}>
                {s.value === null ? <span className="animate-pulse text-(--text-faint)">—</span> : <CountUp value={s.value} />}
              </p>
              <p className="mt-0.5 text-xs font-medium text-(--text-secondary)">{s.label}</p>
            </button>
          ))}
          <button
            type="button"
            onClick={() => navigate("review")}
            className={cn(
              "flex items-center gap-3 rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-4 py-2 text-left shadow-sm transition-all hover:-translate-y-px hover:border-(--accent)/40",
              focusRing,
            )}
          >
            <HealthRing score={vpc.score} size={48} />
            <span className="text-xs font-medium text-(--text-secondary)">Design health</span>
          </button>
        </div>

        {pending.length > 0 && (
          <p className="flex items-center gap-2 rounded-lg border border-(--accent)/20 bg-(--accent-muted) px-3 py-2 text-xs text-(--accent)" aria-live="polite">
            <span className="h-2 w-2 animate-pulse rounded-full bg-(--accent)" aria-hidden />
            Still loading {pending.join(", ")} — this account has a lot of them. The page fills in by itself.
          </p>
        )}

        {warnings.length > 0 && (
          <details className="rounded-lg border border-(--warn)/20 bg-(--warn-muted) px-3 py-2 text-xs text-(--warn)">
            <summary className="cursor-pointer font-medium">Some data could not be read ({warnings.length})</summary>
            <ul className="mt-1.5 space-y-1">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </details>
        )}

        <nav role="tablist" aria-label="VPC views" className="flex gap-1 overflow-x-auto border-b border-(--border-hairline)">
          {VIEWS.map((v, i) => (
            <button
              key={v.id}
              role="tab"
              type="button"
              aria-selected={view === v.id}
              title={`${v.hint}  (${i + 1})`}
              onClick={() => navigate(v.id)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                focusRing,
                view === v.id
                  ? "border-(--accent) font-medium text-(--text-primary)"
                  : "border-transparent text-(--text-muted) hover:text-(--text-primary)",
              )}
            >
              {v.label}
              {counts[v.id] !== undefined && (
                <span
                  className={cn(
                    "rounded-lg px-1.5 text-[10px] tabular-nums",
                    mono,
                    v.id === "review" && counts.review ? "bg-(--warn-muted) text-(--warn)" : "bg-(--bg-muted) text-(--text-muted)",
                  )}
                >
                  {counts[v.id]}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <section role="tabpanel" aria-label={viewLabel} key={view}>
        {view === "topology" && (
          <TopologyView
            vpc={vpc}
            region={region}
            selectedId={search.get("select") ?? undefined}
            onSelect={(id) => navigate("topology", id ? { select: id } : {})}
            onNavigate={navigate}
            onOpenResource={openResource}
          />
        )}
        {view === "resources" && (
          <ResourcesView
            vpc={vpc}
            rows={rows}
            region={region}
            subnetFilter={search.get("subnet") ?? undefined}
            onNavigate={navigate}
            onOpenResource={openResource}
          />
        )}
        {view === "load-balancers" && (
          <LoadBalancersView
            vpc={vpc}
            region={region}
            focusArn={search.get("lb") ?? undefined}
            onNavigate={navigate}
            onOpenResource={openResource}
          />
        )}
        {view === "subnets" && <SubnetsView vpc={vpc} region={region} onNavigate={navigate} />}
        {view === "routing" && <RoutingView vpc={vpc} region={region} initialFrom={search.get("from") ?? undefined} />}
        {view === "security" && <SecurityView vpc={vpc} region={region} focusId={search.get("focus") ?? undefined} />}
        {view === "connectivity" && <ConnectivityView vpc={vpc} region={region} />}
        {view === "planner" && <PlannerView vpc={vpc} others={vpcs} />}
        {view === "review" && <ReviewView vpc={vpc} onNavigate={navigate} onOpenResource={openResource} />}
      </section>

      {drawerRow && <ResourceDrawer vpc={vpc} region={region} row={drawerRow} onClose={closeResource} onNavigate={navigate} />}

      {helpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setHelpOpen(false)} />
          <div role="dialog" aria-label="Keyboard shortcuts" className="vpc-pop relative w-full max-w-sm rounded-xl border border-(--border) bg-(--bg-elevated) p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-(--text-primary)">Keyboard shortcuts</h2>
            <ul className="mt-4 space-y-2">
              {SHORTCUTS.map(([key, what]) => (
                <li key={key} className="flex items-center justify-between text-xs text-(--text-secondary)">
                  {what}
                  <Kbd>{key}</Kbd>
                </li>
              ))}
            </ul>
            <ul className="mt-4 space-y-1 border-t border-(--border-hairline) pt-3">
              {VIEWS.map((v, i) => (
                <li key={v.id} className="flex items-center justify-between text-[11px] text-(--text-muted)">
                  {v.label} — {v.hint}
                  <Kbd>{String(i + 1)}</Kbd>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
