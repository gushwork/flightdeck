/** Client-safe DTOs for the cross-cloud spend page (`/costs`). */

export type CloudProvider = "aws" | "azure" | "gcp";

export interface CostPeriod {
  /** First day of last month, `YYYY-MM-DD` (UTC). */
  lastMonthStart: string;
  /** First day of the current month, `YYYY-MM-DD` (UTC). */
  monthStart: string;
  /** Tomorrow, `YYYY-MM-DD` (UTC) — exclusive end so today's partial spend is included. */
  end: string;
  daysElapsed: number;
  daysInMonth: number;
}

export interface ServiceCost {
  name: string;
  monthToDate: number;
  lastMonth: number;
}

export type ProviderCost =
  | {
      provider: CloudProvider;
      status: "ok";
      /** What was queried, e.g. "2 accounts" or "2 subscriptions". */
      scope: string;
      currency: string;
      /** Charges before credits, refunds and tax. */
      monthToDate: number;
      lastMonth: number;
      /** Sorted by month-to-date spend, highest first. */
      services: ServiceCost[];
      /** Credits and refunds (negative), not deducted from the spend above. */
      credits: { monthToDate: number; lastMonth: number };
      /** Partial data, e.g. one Azure subscription failed. */
      warning?: string;
    }
  | {
      provider: CloudProvider;
      /** `unconfigured` = CLI missing or not set up; `error` = the query failed. */
      status: "unconfigured" | "error";
      error: string;
    };

export interface CostsSnapshot {
  period: CostPeriod;
  providers: ProviderCost[];
  fetchedAt: string;
}

export const PROVIDER_LABEL: Record<CloudProvider, string> = {
  aws: "AWS",
  azure: "Azure",
  gcp: "Google Cloud",
};
