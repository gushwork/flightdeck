import { describe, expect, it } from "vitest";
import { findHostedZoneForDomain } from "./route53";
import type { Route53HostedZoneSummary } from "@/lib/domains/types";

const zones: Route53HostedZoneSummary[] = [
  { id: "1", name: "example.com.", recordCount: 10, privateZone: false },
  { id: "2", name: "internal.example.com.", recordCount: 5, privateZone: true },
  { id: "3", name: "co.uk.", recordCount: 1, privateZone: false },
];

describe("findHostedZoneForDomain", () => {
  it("picks longest suffix", () => {
    expect(findHostedZoneForDomain("app.internal.example.com", zones)?.id).toBe("2");
    expect(findHostedZoneForDomain("app.example.com", zones)?.id).toBe("1");
  });
  it("includes private zones", () => {
    expect(findHostedZoneForDomain("svc.internal.example.com", zones)?.privateZone).toBe(true);
  });
});
