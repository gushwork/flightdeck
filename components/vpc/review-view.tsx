"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { gradeOf } from "@/lib/vpc/review";
import type { FindingSeverity, VpcDetail, VpcFinding, VpcViewId } from "@/lib/vpc/types";
import { HealthRing } from "./health-ring";
import { Card, Chip, CopyId, FilterChip, GhostButton, focusRing, mono, plural, type Tone } from "./ui";

const SEVERITIES: FindingSeverity[] = ["high", "medium", "low", "info"];
const SEVERITY_TONE: Record<FindingSeverity, Tone> = { high: "danger", medium: "warn", low: "accent", info: "muted" };
const SEVERITY_LABEL: Record<FindingSeverity, string> = { high: "High", medium: "Medium", low: "Low", info: "FYI" };
const VIEW_LABEL: Partial<Record<VpcViewId, string>> = {
  topology: "Topology",
  resources: "Resources",
  "load-balancers": "Load balancers",
  subnets: "Subnets",
  routing: "Routing",
  security: "Security",
  connectivity: "Connectivity",
  planner: "Planner",
};
const CONFETTI_COLORS = ["var(--accent)", "var(--success)", "var(--warn)", "var(--danger)"];

function Celebration() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center" aria-hidden>
      {Array.from({ length: 22 }, (_, i) => (
        <span
          key={i}
          className="vpc-confetti absolute h-2 w-1 rounded-[1px]"
          style={
            {
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              "--dx": `${(i % 2 ? 1 : -1) * (24 + ((i * 37) % 120))}px`,
              "--dy": `${-20 - ((i * 53) % 90)}px`,
              "--rot": `${(i * 47) % 360}deg`,
              animationDelay: `${(i % 6) * 40}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

interface Props {
  vpc: VpcDetail;
  onNavigate: (view: VpcViewId, params?: Record<string, string>) => void;
  onOpenResource: (key: string) => void;
}

export function ReviewView({ vpc, onNavigate, onOpenResource }: Props) {
  const [only, setOnly] = useState<FindingSeverity | null>(null);
  const grade = gradeOf(vpc.score);
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, vpc.findings.filter((f) => f.severity === s).length])) as Record<FindingSeverity, number>;
  const actionable = counts.high + counts.medium + counts.low;
  const shown = vpc.findings.filter((f) => !only || f.severity === only);

  const lbArns = new Set(vpc.loadBalancers.map((l) => l.arn));
  const serviceIds = new Set(vpc.services.map((s) => s.id));
  const linkable = (id: string) => id.startsWith("subnet-") || id.startsWith("sg-") || lbArns.has(id) || serviceIds.has(id);
  const label = (id: string) =>
    vpc.loadBalancers.find((l) => l.arn === id)?.name ?? vpc.subnets.find((s) => s.id === id)?.name ?? id;
  const jump = (f: VpcFinding, id: string) => {
    if (id.startsWith("subnet-")) onNavigate("topology", { select: id });
    else if (id.startsWith("sg-")) onNavigate("security", { focus: id });
    else if (lbArns.has(id)) onNavigate("load-balancers", { lb: id });
    else if (serviceIds.has(id)) onOpenResource(`${vpc.services.find((s) => s.id === id)?.kind}:${id}`);
    else onNavigate(f.view);
  };

  return (
    <div className="space-y-4">
      <Card className="relative flex flex-wrap items-center gap-6 overflow-hidden">
        {actionable === 0 && <Celebration />}
        <HealthRing score={vpc.score} size={88} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-medium text-(--text-primary) font-(family-name:--font-display)">
            {actionable === 0 ? "Clean bill of health" : grade.label}
          </p>
          <p className="mt-1 max-w-xl text-sm text-(--text-secondary)">
            {actionable === 0
              ? "Nothing in this VPC trips the design and hygiene checks. Nice work."
              : `${plural(actionable, "thing")} worth a look. Each finding below says why it matters and what usually fixes it.`}
          </p>
          <p className="mt-2 text-[11px] text-(--text-faint)">
            Heuristic checks on topology, routing, security groups and capacity — a prompt for review, not an audit.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SEVERITIES.map((s) => (
            <FilterChip key={s} active={only === s} onClick={() => setOnly(only === s ? null : s)}>
              {SEVERITY_LABEL[s]} <span className={`tabular-nums text-(--text-faint) ${mono}`}>{counts[s]}</span>
            </FilterChip>
          ))}
        </div>
      </Card>

      <div className="space-y-3">
        {shown.map((f, i) => (
          <Card key={f.id} className="vpc-pop space-y-2" >
            <div style={{ animationDelay: `${i * 30}ms` }} className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  <Chip tone={SEVERITY_TONE[f.severity]} className="mt-0.5 shrink-0">
                    {SEVERITY_LABEL[f.severity]}
                  </Chip>
                  <p className="text-sm font-medium text-(--text-primary)">{f.title}</p>
                </div>
                <GhostButton onClick={() => onNavigate(f.view)}>Open {VIEW_LABEL[f.view] ?? f.view}</GhostButton>
              </div>
              <p className="text-xs leading-relaxed text-(--text-secondary)">{f.detail}</p>
              {f.fix && (
                <p className="rounded-lg border border-(--border-hairline) bg-(--bg-field) px-3 py-2 text-xs text-(--text-secondary)">
                  <span className="font-medium text-(--text-primary)">Usual fix: </span>
                  {f.fix}
                </p>
              )}
              {f.resourceIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {f.resourceIds.slice(0, 6).map((id) => (
                    <span key={id} className="flex items-center">
                      <CopyId value={id} label={label(id)} className="text-[11px]" />
                      {linkable(id) && (
                        <button
                          type="button"
                          onClick={() => jump(f, id)}
                          className={cn("rounded-lg px-1 text-[11px] text-(--accent) hover:underline", focusRing)}
                        >
                          show
                        </button>
                      )}
                    </span>
                  ))}
                  {f.resourceIds.length > 6 && <span className="text-[11px] text-(--text-faint)">+{f.resourceIds.length - 6} more</span>}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
