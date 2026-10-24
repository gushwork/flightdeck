"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { consoleUrl } from "@/lib/vpc/links";
import { LB_LABEL, lbHealth } from "@/lib/vpc/resources";
import type { LbListener, LbTarget, LbTargetGroup, VpcDetail, VpcLoadBalancer, VpcViewId } from "@/lib/vpc/types";
import {
  Card,
  Chip,
  ConsoleLink,
  CopyId,
  EmptyState,
  FilterChip,
  GhostButton,
  StateChip,
  focusRing,
  inputClass,
  mono,
  plural,
  useSearchFocus,
  type Tone,
} from "./ui";

const HEALTH_TONE: Record<string, Tone> = {
  healthy: "success",
  unhealthy: "danger",
  initial: "warn",
  draining: "warn",
  unused: "muted",
  unavailable: "muted",
};
const DOT: Record<Tone, string> = {
  success: "bg-(--success)",
  danger: "bg-(--danger)",
  warn: "bg-(--warn)",
  muted: "bg-(--text-faint)",
  accent: "bg-(--accent)",
};
const healthTone = (h: string): Tone => HEALTH_TONE[h] ?? "muted";

function HealthPill({ lb }: { lb: VpcLoadBalancer }) {
  const { healthy, total } = lbHealth(lb);
  const tone: Tone = total === 0 ? "muted" : healthy === total ? "success" : healthy === 0 ? "danger" : "warn";
  return <Chip tone={tone}>{total === 0 ? "no targets" : `${healthy}/${total} healthy`}</Chip>;
}

function HealthBar({ targets }: { targets: LbTarget[] }) {
  if (targets.length === 0) return <div className="h-1.5 rounded-lg bg-(--bg-muted)" />;
  return (
    <div className="flex h-1.5 gap-px overflow-hidden rounded-lg" aria-label={`${targets.filter((t) => t.health === "healthy").length} of ${targets.length} healthy`}>
      {targets.map((t, i) => (
        <span key={`${t.id}-${t.port}-${i}`} className={cn("flex-1", DOT[healthTone(t.health)])} />
      ))}
    </div>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-(--text-muted)">{title}</p>
      {children}
    </div>
  );
}

type Route = { key: string; label: string; conditions: string[]; action: string; tgArns: string[] };

function routesOf(listener: LbListener | undefined): Route[] {
  if (!listener) return [];
  return [
    ...listener.rules.map((r) => ({
      key: `rule-${r.priority}`,
      label: `#${r.priority}`,
      conditions: r.conditions,
      action: r.action,
      tgArns: r.targetGroupArns,
    })),
    { key: "default", label: "default", conditions: [], action: listener.action, tgArns: listener.targetGroupArns },
  ];
}

interface CardProps {
  lb: VpcLoadBalancer;
  vpc: VpcDetail;
  region: string;
  open: boolean;
  onToggle: () => void;
  onNavigate: (view: VpcViewId, params?: Record<string, string>) => void;
  onOpenResource: (key: string) => void;
}

function LoadBalancerCard({ lb, vpc, region, open, onToggle, onNavigate, onOpenResource }: CardProps) {
  const [listenerArn, setListenerArn] = useState(lb.listeners[0]?.arn);
  const [routeKey, setRouteKey] = useState<string | null>(null);
  const listener = lb.listeners.find((l) => l.arn === listenerArn);
  const routes = routesOf(listener);
  const route = routes.find((r) => r.key === routeKey);
  const active = new Set(route ? route.tgArns : routes.flatMap((r) => r.tgArns));
  const activeGroups = lb.targetGroups.filter((tg) => active.has(tg.arn));
  const sgName = (id: string) => vpc.securityGroups.find((g) => g.id === id)?.name ?? id;
  const subnetName = (id: string) => vpc.subnets.find((s) => s.id === id)?.name || id;
  const isHttp = listener?.protocol === "HTTP" || listener?.protocol === "HTTPS";

  const targetLabel = (t: LbTarget, tg: LbTargetGroup) => {
    if (tg.targetType === "lambda") return t.id.split(":").at(-1) ?? t.id;
    return vpc.instances.find((i) => i.id === t.id)?.name || t.id;
  };

  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn("flex w-full flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-(--bg-hover)", focusRing)}
      >
        <span aria-hidden className={cn("text-xs text-(--text-faint) transition-transform", open && "rotate-90")}>
          ▶
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-(--text-primary)">{lb.name}</span>
          <span className={`block truncate text-[11px] text-(--text-muted) ${mono}`}>{lb.dnsName}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <Chip tone="accent">{LB_LABEL[lb.type]}</Chip>
          <Chip tone={lb.scheme === "internet-facing" ? "warn" : "muted"}>{lb.scheme}</Chip>
          <Chip>{lb.listeners.map((l) => `${l.protocol}:${l.port}`).join(" · ") || "no listeners"}</Chip>
          <HealthPill lb={lb} />
          <StateChip state={lb.state} />
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-(--border-hairline) px-4 py-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <span className="flex items-center gap-1 text-(--text-muted)">
              DNS <CopyId value={lb.dnsName} />
            </span>
            <span className="flex flex-wrap items-center gap-1 text-(--text-muted)">
              Subnets
              {lb.subnetIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onNavigate("topology", { select: id })}
                  className={cn("rounded-lg", focusRing)}
                  title="Show in topology"
                >
                  <Chip className="hover:border-(--accent)/40">{subnetName(id)}</Chip>
                </button>
              ))}
            </span>
            {lb.securityGroupIds.length > 0 && (
              <span className="flex flex-wrap items-center gap-1 text-(--text-muted)">
                Security groups
                {lb.securityGroupIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onNavigate("security", { focus: id })}
                    className={cn("rounded-lg", focusRing)}
                  >
                    <Chip className="hover:border-(--accent)/40">{sgName(id)}</Chip>
                  </button>
                ))}
              </span>
            )}
            <span className="ml-auto flex items-center gap-1">
              <GhostButton onClick={() => onOpenResource(lb.arn)}>Details</GhostButton>
              <ConsoleLink href={consoleUrl(region, "load-balancer", lb.arn)} />
            </span>
          </div>

          {lb.listeners.length === 0 ? (
            <p className="text-xs text-(--text-muted)">No listeners — this load balancer accepts no traffic.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
              <Column title={lb.scheme === "internet-facing" ? "Internet → listeners" : "VPC clients → listeners"}>
                {lb.listeners.map((l) => (
                  <button
                    key={l.arn}
                    type="button"
                    onClick={() => {
                      setListenerArn(l.arn);
                      setRouteKey(null);
                    }}
                    aria-pressed={l.arn === listenerArn}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                      focusRing,
                      l.arn === listenerArn
                        ? "border-(--accent)/50 bg-(--accent-muted)"
                        : "border-(--border-hairline) bg-(--bg-field) hover:border-(--accent)/30",
                    )}
                  >
                    <p className={`text-sm font-medium text-(--text-primary) ${mono}`}>
                      {l.protocol} :{l.port}
                    </p>
                    <p className="mt-0.5 text-[11px] text-(--text-muted)">
                      {l.rules.length > 0 ? plural(l.rules.length, "rule") : "default only"}
                      {l.certificates > 0 && ` · ${plural(l.certificates, "certificate")}`}
                    </p>
                    {l.sslPolicy && <p className={`truncate text-[10px] text-(--text-faint) ${mono}`}>{l.sslPolicy}</p>}
                  </button>
                ))}
              </Column>

              <Column title={isHttp ? "Rules (first match wins)" : "Routing"}>
                {!isHttp && <p className="text-[11px] text-(--text-faint)">Layer 4 listener — every connection takes the default action.</p>}
                {routes.map((r, i) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRouteKey(routeKey === r.key ? null : r.key)}
                    aria-pressed={routeKey === r.key}
                    style={{ animationDelay: `${i * 30}ms` }}
                    className={cn(
                      "vpc-pop w-full rounded-xl border px-3 py-2 text-left text-xs transition-colors",
                      focusRing,
                      routeKey === r.key
                        ? "border-(--accent)/50 bg-(--accent-muted)"
                        : routeKey
                          ? "border-(--border-hairline) opacity-50 hover:opacity-100"
                          : "border-(--border-hairline) bg-(--bg-field) hover:border-(--accent)/30",
                    )}
                  >
                    <span className="flex items-start gap-2">
                      <Chip className="shrink-0">{r.label}</Chip>
                      <span className="min-w-0">
                        <span className="block text-(--text-secondary)">
                          {r.conditions.length ? r.conditions.join(" and ") : r.key === "default" && routes.length > 1 ? "anything else" : "all requests"}
                        </span>
                        <span className={`block truncate text-(--text-primary) ${mono}`} title={r.action}>
                          {r.action}
                        </span>
                      </span>
                    </span>
                  </button>
                ))}
              </Column>

              <Column title="Target groups">
                {lb.targetGroups.length === 0 && <p className="text-[11px] text-(--text-faint)">None attached.</p>}
                {lb.targetGroups.map((tg) => {
                  const on = active.has(tg.arn);
                  return (
                    <div
                      key={tg.arn}
                      className={cn(
                        "rounded-xl border px-3 py-2 transition-opacity",
                        on ? "border-(--accent)/30 bg-(--bg-field)" : "border-(--border-hairline) opacity-40",
                      )}
                    >
                      <p className="truncate text-sm font-medium text-(--text-primary)">{tg.name}</p>
                      <p className={`text-[11px] text-(--text-muted) ${mono}`}>
                        {tg.protocol}
                        {tg.port ? `:${tg.port}` : ""} · {tg.targetType}
                      </p>
                      <p className="mb-1.5 truncate text-[10px] text-(--text-faint)" title={tg.healthCheck}>
                        health check {tg.healthCheck || "—"}
                      </p>
                      <HealthBar targets={tg.targets} />
                    </div>
                  );
                })}
              </Column>

              <Column title="Targets">
                {activeGroups.flatMap((g) => g.targets).length === 0 ? (
                  <p className="text-[11px] text-(--text-faint)">
                    {activeGroups.length === 0 ? "This route does not forward to a target group." : "No targets registered."}
                  </p>
                ) : (
                  activeGroups.map((tg) =>
                    tg.targets.map((t, i) => {
                      const instance = vpc.instances.find((x) => x.id === t.id);
                      return (
                        <button
                          key={`${tg.arn}-${t.id}-${t.port}-${i}`}
                          type="button"
                          disabled={!instance}
                          onClick={() => instance && onOpenResource(instance.id)}
                          title={t.reason ?? t.health}
                          className={cn(
                            "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs",
                            instance && "hover:bg-(--bg-hover)",
                            focusRing,
                          )}
                        >
                          <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", DOT[healthTone(t.health)])} />
                          <span className="min-w-0">
                            <span className="block truncate text-(--text-primary)">
                              {targetLabel(t, tg)}
                              {t.port ? <span className={`text-(--text-faint) ${mono}`}> :{t.port}</span> : null}
                            </span>
                            <span className="block truncate text-[10px] text-(--text-muted)">
                              {t.health}
                              {t.az ? ` · ${t.az}` : ""}
                              {t.reason && t.health !== "healthy" ? ` · ${t.reason}` : ""}
                            </span>
                          </span>
                        </button>
                      );
                    }),
                  )
                )}
              </Column>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

type Filter = "all" | "internet-facing" | "internal" | "unhealthy";

interface Props {
  vpc: VpcDetail;
  region: string;
  focusArn?: string;
  onNavigate: (view: VpcViewId, params?: Record<string, string>) => void;
  onOpenResource: (key: string) => void;
}

export function LoadBalancersView({ vpc, region, focusArn, onNavigate, onOpenResource }: Props) {
  const searchRef = useSearchFocus();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(focusArn ? [focusArn] : vpc.loadBalancers.length <= 2 ? vpc.loadBalancers.map((l) => l.arn) : []),
  );

  const unhealthy = (lb: VpcLoadBalancer) => {
    const { healthy, total } = lbHealth(lb);
    return total === 0 || healthy < total;
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vpc.loadBalancers
      .filter((lb) =>
        filter === "all" ? true : filter === "unhealthy" ? unhealthy(lb) : lb.scheme === filter,
      )
      .filter((lb) => !q || [lb.name, lb.dnsName, ...lb.targetGroups.map((t) => t.name)].join(" ").toLowerCase().includes(q));
  }, [vpc.loadBalancers, query, filter]);

  if (vpc.loadBalancers.length === 0) {
    return (
      <EmptyState
        title="No load balancers in this VPC"
        hint={
          vpc.coverage.loadBalancers
            ? "No ALB, NLB or Gateway Load Balancer is deployed here."
            : "Elastic Load Balancing could not be read — the credentials may lack elasticloadbalancing:Describe*."
        }
      />
    );
  }

  const all = vpc.loadBalancers.flatMap((lb) => lb.targetGroups.flatMap((t) => t.targets));
  const healthyCount = all.filter((t) => t.health === "healthy").length;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-2">
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, DNS, target group…  ( / )"
          aria-label="Search load balancers"
          className={`${inputClass} w-72`}
        />
        {(
          [
            ["all", `All ${vpc.loadBalancers.length}`],
            ["internet-facing", `Internet-facing ${vpc.loadBalancers.filter((l) => l.scheme === "internet-facing").length}`],
            ["internal", `Internal ${vpc.loadBalancers.filter((l) => l.scheme === "internal").length}`],
            ["unhealthy", `Needs attention ${vpc.loadBalancers.filter(unhealthy).length}`],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <FilterChip key={id} active={filter === id} onClick={() => setFilter(id)}>
            {label}
          </FilterChip>
        ))}
        <span className="ml-auto text-xs text-(--text-muted)">
          Targets{" "}
          <span className={`tabular-nums text-(--text-primary) ${mono}`}>
            {healthyCount}/{all.length}
          </span>{" "}
          healthy
        </span>
      </Card>
      <p className="text-[11px] text-(--text-faint)">
        Pick a listener, then a rule, to trace which target groups and targets it reaches. Click a target instance for details.
      </p>
      {shown.length === 0 ? (
        <EmptyState title="No load balancers match" />
      ) : (
        <div className="space-y-3">
          {shown.map((lb) => (
            <LoadBalancerCard
              key={lb.arn}
              lb={lb}
              vpc={vpc}
              region={region}
              open={open.has(lb.arn)}
              onToggle={() =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (!next.delete(lb.arn)) next.add(lb.arn);
                  return next;
                })
              }
              onNavigate={onNavigate}
              onOpenResource={onOpenResource}
            />
          ))}
        </div>
      )}
    </div>
  );
}
