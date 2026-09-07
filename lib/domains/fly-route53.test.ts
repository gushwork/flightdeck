import { describe, expect, it } from "vitest";
import { computeChangesHash, groupInstructions } from "./fly-route53";
import type { DnsRecordChange } from "./types";
import type { FlyDnsRecordInstruction } from "@/lib/fly/types";

describe("groupInstructions", () => {
  it("merges multiple A values for one name", () => {
    const rows: FlyDnsRecordInstruction[] = [
      { name: "app.example.com", type: "A", value: "1.1.1.1" },
      { name: "app.example.com", type: "A", value: "2.2.2.2" },
    ];
    const g = groupInstructions(rows);
    expect(g).toHaveLength(1);
    expect(g[0].values.sort()).toEqual(["1.1.1.1", "2.2.2.2"]);
  });
});

describe("computeChangesHash", () => {
  it("is stable regardless of value order", () => {
    const a: DnsRecordChange[] = [
      {
        name: "a.example.com",
        type: "A",
        ttl: 300,
        values: ["1.1.1.1"],
        currentValues: [],
        action: "CREATE",
      },
    ];
    const b: DnsRecordChange[] = [
      {
        name: "a.example.com",
        type: "A",
        ttl: 300,
        values: ["1.1.1.1"],
        currentValues: [],
        action: "CREATE",
      },
    ];
    expect(computeChangesHash(a)).toBe(computeChangesHash(b));
  });
});
