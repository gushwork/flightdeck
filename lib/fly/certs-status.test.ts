import { describe, expect, it } from "vitest";
import {
  buildAppDomainRow,
  mapCertStatus,
  parseCertCheckResult,
  parseDnsRequirements,
  toCertSummary,
} from "./certs";
import sample from "../domains/__fixtures__/fly-certs-check-sample.json";

describe("mapCertStatus", () => {
  it("maps ready/issued", () => {
    expect(mapCertStatus("Ready")).toBe("ready");
    expect(mapCertStatus("Issued")).toBe("ready");
  });
  it("maps pending", () => {
    expect(mapCertStatus("Awaiting configuration")).toBe("pending");
    expect(mapCertStatus("Pending")).toBe("pending");
  });
  it("maps failed", () => {
    expect(mapCertStatus("Error: DNS validation failed")).toBe("failed");
  });
});

describe("flyctl list cert shape", () => {
  it("flags awaiting configuration as needsAttention", () => {
    const cert = toCertSummary(
      "rag-api-dev.gushwork.ai",
      "Awaiting configuration",
      false,
    );
    expect(cert.status).toBe("pending");
    const row = buildAppDomainRow("gw-rag-api", "org", "gw-rag-api.fly.dev", [cert]);
    expect(row.needsAttention).toBe(true);
  });
});

describe("parseCertCheckResult", () => {
  it("extracts DNSValidationInstructions", () => {
    const cert = parseCertCheckResult("app.example.com", {
      ClientStatus: "Awaiting configuration",
      DNSValidationInstructions: [
        { Name: "app.example.com", Type: "A", Value: "1.2.3.4", TTL: 600 },
      ],
    });
    expect(cert.status).toBe("pending");
    expect(cert.dnsRecords).toEqual([
      { name: "app.example.com", type: "A", value: "1.2.3.4", ttl: 600 },
    ]);
  });

  it("extracts dns_requirements from current flyctl check JSON", () => {
    const cert = parseCertCheckResult(
      "rag-api-dev.gushwork.ai",
      sample,
    );
    expect(cert.status).toBe("pending");
    expect(cert.dnsRecords.some((r) => r.type === "A" && r.value === "66.241.125.127")).toBe(true);
    expect(cert.dnsRecords.some((r) => r.type === "AAAA")).toBe(true);
    expect(cert.dnsRecords.some((r) => r.name.startsWith("_fly-ownership"))).toBe(true);
  });
});

describe("parseDnsRequirements", () => {
  it("skips CNAME on hostname when A records present", () => {
    const records = parseDnsRequirements("app.example.com", {
      a: ["1.2.3.4"],
      cname: "app.fly.dev",
    });
    expect(records.some((r) => r.type === "CNAME" && r.name === "app.example.com")).toBe(false);
  });
});
