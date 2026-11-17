"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { relativeTime } from "@/components/github/run-utils";
import { Skeleton } from "@/components/layout/loading-skeleton";
import { projectMonthEnd } from "@/lib/costs/rollup";
import {
  PROVIDER_LABEL,
  type CloudProvider,
  type CostPeriod,
  type CostsSnapshot,
  type ProviderCost,
} from "@/lib/costs/types";

type OkProvider = Extract<ProviderCost, { status: "ok" }>;

interface ServiceRow {
  provider: CloudProvider;
  name: string;
  currency: string;
  monthToDate: number;
  lastMonth: number;
}

const SERVICE_PREVIEW = 12;

function money(n: number, currency: string, whole = false): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(n);
}

function monthName(isoDay: string): string {
  return new Date(`${isoDay}T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
}

/** Percent change from `base`; null when there is nothing to compare against. */
function change(value: number, base: number): number | null {
  return base > 0 ? ((value - base) / base) * 100 : null;
}

/** Renders `code` spans inside CLI setup hints. */
function HintText({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, i) =>
        i % 2 ? (
          <code
            key={i}
            className="rounded border border-(--border-hairline) bg-(--bg-hover) px-1 py-0.5 font-(family-name:--font-mono) text-[11px] text-(--text-primary)"
          >
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

function ChangeText({ pct, against }: { pct: number | null; against: string }) {
  if (pct === null) return null;
  const arrow = pct >= 0 ? "↑" : "↓";
  return (
    <span className="font-(family-name:--font-mono) tabular-nums">
      {arrow} {Math.abs(pct).toFixed(0)}% vs {against}
    </span>
  );
}

function ShareMeter({ share, label }: { share: number; label: string }) {
  const pct = Math.max(0, Math.min(100, share * 100));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="h-1.5 w-full overflow-hidden rounded-full bg-(--bg-muted)"
    >
      <div className="h-full rounded-full bg-(--accent)" style={{ width: `${pct}%` }} />
    </div>
  );
}

function TotalsHero({
  currency,
  monthToDate,
  lastMonth,
  credits,
  period,
}: {
  currency: string;
  monthToDate: number;
  lastMonth: number;
  /** Month-to-date credits (negative), not deducted from `monthToDate`. */
  credits: number;
  period: CostPeriod;
}) {
  const projected = projectMonthEnd(monthToDate, period);
  const lastLabel = monthName(period.lastMonthStart);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm">
        <p className="text-xs font-medium text-(--text-secondary)">{monthName(period.monthStart)} to date</p>
        <p className="mt-1 font-(family-name:--font-mono) text-3xl font-light tabular-nums text-(--text-primary)">
          {money(monthToDate, currency, monthToDate >= 1000)}
        </p>
        <p className="mt-1 text-[11px] text-(--text-faint)">
          Day {period.daysElapsed} of {period.daysInMonth}
          {credits !== 0 && ` · ${money(Math.abs(credits), currency)} in credits not deducted`}
        </p>
      </div>
      <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm">
        <p className="text-xs font-medium text-(--text-secondary)">Projected month end</p>
        <p className="mt-1 font-(family-name:--font-mono) text-3xl font-light tabular-nums text-(--text-primary)">
          {money(projected, currency, projected >= 1000)}
        </p>
        <p className="mt-1 text-[11px] text-(--text-faint)">
          <ChangeText pct={change(projected, lastMonth)} against={lastLabel} /> · at current daily pace
        </p>
      </div>
      <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm">
        <p className="text-xs font-medium text-(--text-secondary)">{lastLabel}</p>
        <p className="mt-1 font-(family-name:--font-mono) text-3xl font-light tabular-nums text-(--text-primary)">
          {money(lastMonth, currency, lastMonth >= 1000)}
        </p>
        <p className="mt-1 text-[11px] text-(--text-faint)">Full month</p>
      </div>
    </div>
  );
}

function ProviderCard({
  data,
  period,
  totalMonthToDate,
}: {
  data: ProviderCost;
  period: CostPeriod;
  totalMonthToDate: number;
}) {
  const label = PROVIDER_LABEL[data.provider];
  if (data.status !== "ok") {
    const failed = data.status === "error";
    return (
      <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-(--text-primary)">{label}</h3>
          <span
            className={`rounded-lg px-2 py-0.5 text-[11px] font-medium ${
              failed ? "bg-(--danger-muted) text-(--danger)" : "bg-(--bg-muted) text-(--text-muted)"
            }`}
          >
            {failed ? "Query failed" : "Not set up"}
          </span>
        </div>
        <p className={`mt-3 break-words text-xs leading-relaxed ${failed ? "text-(--danger)" : "text-(--text-muted)"}`}>
          <HintText text={data.error} />
        </p>
      </div>
    );
  }

  const share = totalMonthToDate > 0 ? data.monthToDate / totalMonthToDate : 0;
  const projected = projectMonthEnd(data.monthToDate, period);
  return (
    <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-(--text-primary)">{label}</h3>
        <span className="truncate font-(family-name:--font-mono) text-[11px] text-(--text-faint)" title={data.scope}>
          {data.scope}
        </span>
      </div>
      <p className="mt-3 font-(family-name:--font-mono) text-2xl font-light tabular-nums text-(--text-primary)">
        {money(data.monthToDate, data.currency)}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-(--text-muted)">Projected</dt>
        <dd className="text-right font-(family-name:--font-mono) tabular-nums text-(--text-secondary)">
          {money(projected, data.currency)}
        </dd>
        <dt className="text-(--text-muted)">{monthName(period.lastMonthStart)}</dt>
        <dd className="text-right font-(family-name:--font-mono) tabular-nums text-(--text-secondary)">
          {money(data.lastMonth, data.currency)}
        </dd>
        {data.credits.monthToDate !== 0 && (
          <>
            <dt className="text-(--text-muted)">Credits this month</dt>
            <dd className="text-right font-(family-name:--font-mono) tabular-nums text-(--text-secondary)">
              {money(data.credits.monthToDate, data.currency)}
            </dd>
            <dt className="text-(--text-muted)">After credits</dt>
            <dd className="text-right font-(family-name:--font-mono) tabular-nums text-(--text-secondary)">
              {money(data.monthToDate + data.credits.monthToDate, data.currency)}
            </dd>
          </>
        )}
      </dl>
      <div className="mt-4 space-y-1.5">
        <ShareMeter share={share} label={`${label} share of month-to-date spend`} />
        <p className="text-[11px] text-(--text-faint)">
          <span className="font-(family-name:--font-mono) tabular-nums">{(share * 100).toFixed(0)}%</span> of
          month-to-date spend
        </p>
      </div>
      {data.warning && (
        <p className="mt-3 rounded-lg border border-(--warn)/20 bg-(--warn-muted) px-2.5 py-1.5 text-[11px] text-(--warn)">
          {data.warning}
        </p>
      )}
    </div>
  );
}

function ServicesTable({ rows, period }: { rows: ServiceRow[]; period: CostPeriod }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, SERVICE_PREVIEW);
  const max = Math.max(...rows.map((r) => r.monthToDate), 0);

  return (
    <section aria-labelledby="costs-services-heading">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="costs-services-heading" className="text-sm font-semibold text-(--text-primary)">
          Top services
        </h2>
        <span className="text-xs text-(--text-muted)">Across all clouds, by {monthName(period.monthStart)} spend</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-(--border-hairline) bg-(--bg-field)">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--border-hairline) text-left text-[11px] font-medium uppercase tracking-wide text-(--text-muted)">
              <th className="px-4 py-2.5 font-medium">Service</th>
              <th className="px-4 py-2.5 font-medium">Cloud</th>
              <th className="px-4 py-2.5 text-right font-medium">Month to date</th>
              <th className="px-4 py-2.5 text-right font-medium">Projected</th>
              <th className="px-4 py-2.5 text-right font-medium">{monthName(period.lastMonthStart)}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={`${r.provider}:${r.name}`}
                className="border-b border-(--border-hairline) last:border-0 hover:bg-(--bg-hover)"
              >
                <td className="max-w-[18rem] truncate px-4 py-2.5 text-(--text-primary)" title={r.name}>
                  {r.name}
                </td>
                <td className="px-4 py-2.5 text-xs text-(--text-secondary)">{PROVIDER_LABEL[r.provider]}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-3">
                    <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-(--bg-muted) sm:block" aria-hidden>
                      <div
                        className="h-full rounded-full bg-(--accent)"
                        style={{ width: `${max > 0 ? Math.max(0, (r.monthToDate / max) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="font-(family-name:--font-mono) tabular-nums text-(--text-primary)">
                      {money(r.monthToDate, r.currency)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-(family-name:--font-mono) tabular-nums text-(--text-secondary)">
                  {money(projectMonthEnd(r.monthToDate, period), r.currency)}
                </td>
                <td className="px-4 py-2.5 text-right font-(family-name:--font-mono) tabular-nums text-(--text-secondary)">
                  {money(r.lastMonth, r.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > SERVICE_PREVIEW && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 rounded-lg border border-(--border) bg-(--bg-surface) px-3 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:border-(--accent)/50 hover:text-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
        >
          {showAll ? "Show top services" : `Show all ${rows.length} services`}
        </button>
      )}
    </section>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[108px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[180px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export default function CostsPage() {
  const [snapshot, setSnapshot] = useState<CostsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh: boolean) => {
    try {
      const res = await fetch(refresh ? "/api/costs?refresh=1" : "/api/costs");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSnapshot(data.snapshot);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const view = useMemo(() => {
    if (!snapshot) return null;
    const ok = snapshot.providers.filter((p): p is OkProvider => p.status === "ok");
    const totals = new Map<string, { monthToDate: number; lastMonth: number; credits: number }>();
    for (const p of ok) {
      const t = totals.get(p.currency) ?? { monthToDate: 0, lastMonth: 0, credits: 0 };
      t.monthToDate += p.monthToDate;
      t.lastMonth += p.lastMonth;
      t.credits += p.credits.monthToDate;
      totals.set(p.currency, t);
    }
    const services: ServiceRow[] = ok
      .flatMap((p) => p.services.map((s) => ({ ...s, provider: p.provider, currency: p.currency })))
      .sort((a, b) => b.monthToDate - a.monthToDate || b.lastMonth - a.lastMonth);
    const missing = snapshot.providers.filter((p) => p.status !== "ok").map((p) => PROVIDER_LABEL[p.provider]);
    return { ok, totals: [...totals.entries()], services, missing };
  }, [snapshot]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-(family-name:--font-display) text-2xl font-medium tracking-tight text-(--text-primary)">
            Cloud spend
          </h1>
          <p className="mt-1 text-sm text-(--text-secondary)">
            Month-to-date and last-month spend across AWS, Azure and Google Cloud, read with your local{" "}
            <HintText text="`aws`, `az` and `bq`" /> sessions.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {snapshot && (
            <span className="text-xs text-(--text-muted)" title={new Date(snapshot.fetchedAt).toLocaleString()}>
              Updated {relativeTime(snapshot.fetchedAt)}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void load(true);
            }}
            disabled={loading}
            title="Re-runs the CLIs. Each AWS Cost Explorer request is billed $0.01."
            className="rounded-lg border border-(--border) bg-(--bg-surface) px-3 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:border-(--accent)/50 hover:text-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-(--danger)/20 bg-(--danger-muted) px-4 py-3 text-sm text-(--danger)">
          {error}
        </div>
      )}

      {!snapshot || !view ? (
        loading && <LoadingState />
      ) : (
        <>
          {view.missing.length > 0 && view.ok.length > 0 && (
            <p className="rounded-lg border border-(--warn)/20 bg-(--warn-muted) px-4 py-2.5 text-xs text-(--warn)">
              {view.missing.join(" and ")} not included. Totals cover {view.ok.length} of{" "}
              {snapshot.providers.length} clouds.
            </p>
          )}

          {view.totals.map(([currency, t]) => (
            <TotalsHero key={currency} currency={currency} {...t} period={snapshot.period} />
          ))}

          <section aria-label="Spend by cloud" className="grid gap-4 md:grid-cols-3">
            {snapshot.providers.map((p) => (
              <ProviderCard
                key={p.provider}
                data={p}
                period={snapshot.period}
                totalMonthToDate={
                  p.status === "ok" ? (view.totals.find(([c]) => c === p.currency)?.[1].monthToDate ?? 0) : 0
                }
              />
            ))}
          </section>

          {view.services.length > 0 && <ServicesTable rows={view.services} period={snapshot.period} />}

          <p className="text-[11px] leading-relaxed text-(--text-faint)">
            Spend is charges before credits, refunds and tax; credits are listed on each card, not deducted. AWS: Cost
            Explorer unblended cost for every local AWS CLI profile, each account counted once. Azure: Cost Management
            actual cost for every enabled subscription (Azure credits apply on the invoice, so none show here). Google
            Cloud: Cloud Billing export in BigQuery; its credits include sustained- and committed-use discounts.
            Provider data can lag by up to a day; results are cached for an hour.
          </p>
        </>
      )}
    </div>
  );
}
