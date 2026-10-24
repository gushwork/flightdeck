"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { consoleUrl } from "@/lib/vpc/links";
import { KIND_LABEL, LB_LABEL, type ResourceRow } from "@/lib/vpc/resources";
import { riskyInbound } from "@/lib/vpc/review";
import type { VpcDetail, VpcViewId } from "@/lib/vpc/types";
import { Chip, ConsoleLink, CopyId, GhostButton, StateChip, TierChip, focusRing, mono, plural } from "./ui";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-(--text-muted)">{title}</p>
      {children}
    </section>
  );
}

interface Props {
  vpc: VpcDetail;
  region: string;
  row: ResourceRow;
  onClose: () => void;
  onNavigate: (view: VpcViewId, params?: Record<string, string>) => void;
}

/** Slide-over with everything known about one resource, linked back into the other views. */
export function ResourceDrawer({ vpc, region, row, onClose, onNavigate }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const behind =
    row.kind === "instance"
      ? vpc.loadBalancers.flatMap((lb) =>
          lb.targetGroups.flatMap((tg) =>
            tg.targets.filter((t) => t.id === row.id).map((t) => ({ lb, tg, health: t.health, port: t.port })),
          ),
        )
      : [];
  const lb = row.lbArn ? vpc.loadBalancers.find((l) => l.arn === row.lbArn) : undefined;

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label={`${KIND_LABEL[row.kind]} ${row.name}`}
        className="vpc-slide absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-(--border) bg-(--bg-elevated) shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-(--border-hairline) px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone="accent">{lb ? LB_LABEL[lb.type] : KIND_LABEL[row.kind]}</Chip>
              <StateChip state={row.state} />
              {row.inferred && (
                <Chip title="The owning service's API was not readable, so this was worked out from network interfaces">inferred</Chip>
              )}
            </div>
            <p className="mt-2 break-words text-base font-semibold text-(--text-primary)">{row.name}</p>
            <CopyId value={row.id} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className={cn("rounded-lg px-2 py-0.5 text-xs text-(--text-muted) hover:bg-(--bg-hover)", focusRing)}
          >
            Esc
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {row.endpoint && (
            <Section title="Endpoint">
              <CopyId value={row.endpoint} className="max-w-full" />
            </Section>
          )}

          {row.attributes.length > 0 && (
            <Section title="Details">
              <dl className="divide-y divide-(--border-hairline)">
                {row.attributes.map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-3 py-1.5 text-xs">
                    <dt className="shrink-0 text-(--text-muted)">{k}</dt>
                    <dd className="min-w-0 break-words text-right text-(--text-primary)">{v}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {lb && (
            <Section title="Listeners">
              <ul className="space-y-1">
                {lb.listeners.map((l) => (
                  <li key={l.arn} className="flex items-start justify-between gap-2 text-xs">
                    <span className={`shrink-0 text-(--text-primary) ${mono}`}>
                      {l.protocol}:{l.port}
                    </span>
                    <span className="min-w-0 truncate text-right text-(--text-muted)" title={l.action}>
                      {l.action}
                    </span>
                  </li>
                ))}
              </ul>
              <GhostButton onClick={() => onNavigate("load-balancers", { lb: lb.arn })}>Trace routing</GhostButton>
            </Section>
          )}

          {behind.length > 0 && (
            <Section title="Behind load balancers">
              <ul className="space-y-1">
                {behind.map((b) => (
                  <li key={`${b.tg.arn}-${b.port}`}>
                    <button
                      type="button"
                      onClick={() => onNavigate("load-balancers", { lb: b.lb.arn })}
                      className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-(--bg-hover)", focusRing)}
                    >
                      <span className="truncate text-(--text-primary)">
                        {b.lb.name} <span className="text-(--text-muted)">→ {b.tg.name}{b.port ? `:${b.port}` : ""}</span>
                      </span>
                      <StateChip state={b.health} />
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {row.subnetIds.length > 0 && (
            <Section title={`Placement · ${plural(row.subnetIds.length, "subnet")}`}>
              <ul className="space-y-1">
                {row.subnetIds.map((id) => {
                  const s = vpc.subnets.find((x) => x.id === id);
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => onNavigate("topology", { select: id })}
                        className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-(--bg-hover)", focusRing)}
                      >
                        <span className="min-w-0 truncate text-(--text-primary)">{s?.name || id}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {s && <span className={`text-(--text-faint) ${mono}`}>{s.az}</span>}
                          {s && <TierChip tier={s.tier} />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {row.securityGroupIds.length > 0 && (
            <Section title="Security groups">
              <ul className="space-y-1">
                {row.securityGroupIds.map((id) => {
                  const sg = vpc.securityGroups.find((g) => g.id === id);
                  const risky = sg ? riskyInbound(sg).length : 0;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => onNavigate("security", { focus: id })}
                        className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-(--bg-hover)", focusRing)}
                      >
                        <span className="min-w-0 truncate text-(--text-primary)">{sg?.name ?? id}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {risky > 0 && <Chip tone="danger">open to internet</Chip>}
                          {sg && <Chip>{sg.inbound.length} in</Chip>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {row.ips.length > 0 && (
            <Section title="IP addresses">
              <div className="flex flex-wrap gap-1">
                {row.ips.map((ip) => (
                  <CopyId key={ip} value={ip} />
                ))}
              </div>
            </Section>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-(--border-hairline) px-5 py-3">
          <GhostButton onClick={() => onNavigate("resources")}>All resources</GhostButton>
          <ConsoleLink href={row.href ?? consoleUrl(region, row.consoleType, row.lbArn ?? row.id)} label="Open in console" />
        </div>
      </aside>
    </div>
  );
}
