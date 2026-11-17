import type { CostPeriod, ServiceCost } from "./types";

/** Provider-agnostic line: spend on one service in one month (`YYYY-MM`). */
export interface CostRow {
  month: string;
  service: string;
  amount: number;
  currency: string;
  /** Credits/refunds (negative amounts): reported beside spend, never netted into it. */
  credit?: boolean;
}

export type AwsCostRow = CostRow & { account: string };

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Last month + month-to-date window, in UTC (all three billing APIs bucket by UTC). */
export function costPeriod(now: Date): CostPeriod {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const today = now.getUTCDate();
  return {
    lastMonthStart: isoDay(new Date(Date.UTC(y, m - 1, 1))),
    monthStart: isoDay(new Date(Date.UTC(y, m, 1))),
    end: isoDay(new Date(Date.UTC(y, m, today + 1))),
    daysElapsed: today,
    daysInMonth: new Date(Date.UTC(y, m + 1, 0)).getUTCDate(),
  };
}

/** Straight-line month-end estimate from month-to-date spend. */
export function projectMonthEnd(monthToDate: number, period: CostPeriod): number {
  return (monthToDate / period.daysElapsed) * period.daysInMonth;
}

/** Sums rows into month-to-date / last-month spend, a per-service breakdown, and credits kept apart. */
export function rollup(rows: CostRow[], period: CostPeriod) {
  const currencies = [...new Set(rows.map((r) => r.currency))];
  if (currencies.length > 1) {
    throw new Error(`Mixed billing currencies (${currencies.join(", ")}); not summed`);
  }
  const current = period.monthStart.slice(0, 7);
  const last = period.lastMonthStart.slice(0, 7);
  const byService = new Map<string, ServiceCost>();
  const spend = { monthToDate: 0, lastMonth: 0 };
  const credits = { monthToDate: 0, lastMonth: 0 };
  for (const r of rows) {
    const key = r.month === current ? "monthToDate" : r.month === last ? "lastMonth" : null;
    if (!key) continue;
    if (r.credit) {
      credits[key] += r.amount;
      continue;
    }
    const s = byService.get(r.service) ?? { name: r.service, monthToDate: 0, lastMonth: 0 };
    s[key] += r.amount;
    spend[key] += r.amount;
    byService.set(r.service, s);
  }
  const services = [...byService.values()]
    .filter((s) => Math.abs(s.monthToDate) >= 0.005 || Math.abs(s.lastMonth) >= 0.005)
    .sort((a, b) => b.monthToDate - a.monthToDate || b.lastMonth - a.lastMonth);
  return { currency: currencies[0] ?? "USD", ...spend, services, credits };
}

/** `aws ce get-cost-and-usage` output grouped by LINKED_ACCOUNT (+ SERVICE for spend). */
export interface AwsCostResponse {
  ResultsByTime?: {
    TimePeriod: { Start: string };
    Groups?: { Keys: string[]; Metrics: Record<string, { Amount: string; Unit: string }> }[];
  }[];
  NextPageToken?: string;
}

export function awsRows(res: AwsCostResponse, credit = false): AwsCostRow[] {
  return (res.ResultsByTime ?? []).flatMap((r) =>
    (r.Groups ?? []).map((g) => ({
      account: g.Keys[0],
      month: r.TimePeriod.Start.slice(0, 7),
      service: g.Keys[1] || "Other",
      amount: Number(g.Metrics.UnblendedCost?.Amount ?? 0),
      currency: g.Metrics.UnblendedCost?.Unit ?? "USD",
      ...(credit && { credit }),
    })),
  );
}

/** Profiles can overlap (a management account sees every member account): keep each account from the first profile that reported it. */
export function dedupeAccounts(perProfile: AwsCostRow[][]): AwsCostRow[] {
  const seen = new Set<string>();
  return perProfile.flatMap((rows) => {
    const fresh = rows.filter((r) => !seen.has(r.account));
    for (const r of fresh) seen.add(r.account);
    return fresh;
  });
}

/** Azure Cost Management `query` output (Monthly granularity, grouped by ServiceName). */
export interface AzureQueryResponse {
  properties: { columns: { name: string }[]; rows: unknown[][] };
}

export function azureRows(res: AzureQueryResponse): CostRow[] {
  const col = (name: string) => res.properties.columns.findIndex((c) => c.name === name);
  const [cost, month, service, currency] = ["Cost", "BillingMonth", "ServiceName", "Currency"].map(col);
  return res.properties.rows.map((r) => ({
    month: String(r[month]).slice(0, 7),
    service: String(r[service] || "Other"),
    amount: Number(r[cost]),
    currency: String(r[currency]),
  }));
}

/** `project.dataset` or `project.dataset.table`; interpolated into SQL, so kept strict. */
const BQ_EXPORT = /^[a-z][a-z0-9-]*\.\w+(\.\w+)?$/;

/** Pre-tax cost and credits (incl. sustained/committed-use discounts) per invoice month and service from the BigQuery billing export. */
export function gcpBillingQuery(source: string, period: CostPeriod): string {
  if (!BQ_EXPORT.test(source)) {
    throw new Error(`GCP_BILLING_EXPORT must be project.dataset or project.dataset.table, got "${source}"`);
  }
  // A dataset holds one standard export table per billing account; the wildcard sums them all.
  const table = source.split(".").length === 2 ? `${source}.gcp_billing_export_v1_*` : source;
  const months = [period.lastMonthStart, period.monthStart].map((d) => `'${d.slice(0, 4)}${d.slice(5, 7)}'`);
  return `SELECT invoice.month AS month, service.description AS service, currency,
  SUM(cost) AS amount,
  SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS credits
FROM \`${table}\`
WHERE invoice.month IN (${months.join(", ")}) AND cost_type != 'tax'
GROUP BY month, service, currency`;
}

/** `bq --format=json query` rows from `gcpBillingQuery`; bq returns every value as a string. */
export function gcpRows(
  rows: { month: string; service: string | null; currency: string; amount: string; credits: string }[],
): CostRow[] {
  return rows.flatMap((r) => {
    const base = { month: `${r.month.slice(0, 4)}-${r.month.slice(4, 6)}`, service: r.service || "Other", currency: r.currency };
    return [
      { ...base, amount: Number(r.amount) },
      { ...base, amount: Number(r.credits), credit: true },
    ];
  });
}
