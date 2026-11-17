import { describe, expect, it } from "vitest";
import {
  awsRows,
  azureRows,
  costPeriod,
  dedupeAccounts,
  gcpBillingQuery,
  gcpRows,
  projectMonthEnd,
  rollup,
} from "./rollup";

const PERIOD = costPeriod(new Date("2026-10-30T15:00:00Z"));

describe("costPeriod", () => {
  it("spans last month through tomorrow (exclusive)", () => {
    expect(PERIOD).toEqual({
      lastMonthStart: "2026-09-01",
      monthStart: "2026-10-01",
      end: "2026-10-31",
      daysElapsed: 30,
      daysInMonth: 31,
    });
  });

  it("rolls over year and month boundaries", () => {
    const p = costPeriod(new Date("2026-01-31T23:00:00Z"));
    expect(p.lastMonthStart).toBe("2025-12-01");
    expect(p.end).toBe("2026-02-01");
    expect(costPeriod(new Date("2028-02-10T00:00:00Z")).daysInMonth).toBe(29);
  });
});

describe("projectMonthEnd", () => {
  it("extends the daily pace to the whole month", () => {
    expect(projectMonthEnd(300, PERIOD)).toBeCloseTo(310);
  });
});

describe("rollup", () => {
  it("splits months, sums totals, sorts services by month-to-date", () => {
    const r = rollup(
      [
        { month: "2026-09", service: "EC2", amount: 100, currency: "USD" },
        { month: "2026-10", service: "EC2", amount: 40, currency: "USD" },
        { month: "2026-10", service: "S3", amount: 60, currency: "USD" },
        { month: "2026-10", service: "Tiny", amount: 0.001, currency: "USD" },
        { month: "2026-08", service: "Old", amount: 999, currency: "USD" },
      ],
      PERIOD,
    );
    expect(r.monthToDate).toBeCloseTo(100.001);
    expect(r.lastMonth).toBe(100);
    expect(r.services.map((s) => s.name)).toEqual(["S3", "EC2"]);
    expect(r.services[1]).toEqual({ name: "EC2", monthToDate: 40, lastMonth: 100 });
  });

  it("refuses to add different currencies", () => {
    expect(() =>
      rollup(
        [
          { month: "2026-10", service: "A", amount: 1, currency: "USD" },
          { month: "2026-10", service: "B", amount: 1, currency: "EUR" },
        ],
        PERIOD,
      ),
    ).toThrow(/Mixed billing currencies/);
  });

  it("keeps credits out of spend and services", () => {
    const r = rollup(
      [
        { month: "2026-10", service: "EC2", amount: 100, currency: "USD" },
        { month: "2026-10", service: "Other", amount: -80, currency: "USD", credit: true },
        { month: "2026-09", service: "Other", amount: -5, currency: "USD", credit: true },
      ],
      PERIOD,
    );
    expect(r.monthToDate).toBe(100);
    expect(r.credits).toEqual({ monthToDate: -80, lastMonth: -5 });
    expect(r.services.map((s) => s.name)).toEqual(["EC2"]);
  });

  it("returns zeros for no rows", () => {
    expect(rollup([], PERIOD)).toEqual({
      currency: "USD",
      monthToDate: 0,
      lastMonth: 0,
      services: [],
      credits: { monthToDate: 0, lastMonth: 0 },
    });
  });
});

describe("dedupeAccounts", () => {
  const row = (account: string, amount: number) => ({ account, month: "2026-10", service: "S3", amount, currency: "USD" });

  it("counts an account seen by several profiles once", () => {
    const member = [row("111", 10)];
    const management = [row("111", 10), row("222", 5), row("222", 1)];
    expect(dedupeAccounts([member, management])).toEqual([row("111", 10), row("222", 5), row("222", 1)]);
  });
});

describe("provider parsers", () => {
  it("reads AWS Cost Explorer groups (account, service)", () => {
    const res = (keys: string[], amount: string) => ({
      ResultsByTime: [
        {
          TimePeriod: { Start: "2026-10-01" },
          Groups: [{ Keys: keys, Metrics: { UnblendedCost: { Amount: amount, Unit: "USD" } } }],
        },
      ],
    });
    expect(awsRows(res(["111", "Amazon S3"], "8.32"))).toEqual([
      { account: "111", month: "2026-10", service: "Amazon S3", amount: 8.32, currency: "USD" },
    ]);
    expect(awsRows(res(["111"], "-4.5"), true)).toEqual([
      { account: "111", month: "2026-10", service: "Other", amount: -4.5, currency: "USD", credit: true },
    ]);
  });

  it("reads Azure query rows by column name", () => {
    expect(
      azureRows({
        properties: {
          columns: [{ name: "Cost" }, { name: "BillingMonth" }, { name: "ServiceName" }, { name: "Currency" }],
          rows: [[35.15, "2026-10-01T00:00:00", "Virtual Machines", "USD"]],
        },
      }),
    ).toEqual([{ month: "2026-10", service: "Virtual Machines", amount: 35.15, currency: "USD" }]);
  });

  it("reads bq rows and builds a guarded query", () => {
    expect(gcpRows([{ month: "202610", service: null, currency: "USD", amount: "1.5", credits: "-0.5" }])).toEqual([
      { month: "2026-10", service: "Other", amount: 1.5, currency: "USD" },
      { month: "2026-10", service: "Other", amount: -0.5, currency: "USD", credit: true },
    ]);
    expect(gcpBillingQuery("my-proj.billing.gcp_billing_export_v1_X", PERIOD)).toContain(
      "invoice.month IN ('202609', '202610') AND cost_type != 'tax'",
    );
    expect(gcpBillingQuery("my-proj.billing", PERIOD)).toContain("FROM `my-proj.billing.gcp_billing_export_v1_*`");
    expect(() => gcpBillingQuery("proj.ds.t`; DROP", PERIOD)).toThrow(/project\.dataset/);
  });
});
