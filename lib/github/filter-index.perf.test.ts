import { describe, expect, it } from "vitest";
import { filterIndexRows } from "./filter-index";
import { makeIndexRows } from "./__fixtures__/secrets-index-fixture";
import { emptyIndexStats } from "./secrets-types";

describe("filterIndexRows perf", () => {
  it("filters 10k rows in under 30ms", () => {
    const rows = makeIndexRows(10_000);
    const doc = {
      version: 1 as const,
      rows,
      stats: emptyIndexStats(),
      scannedAt: new Date().toISOString(),
      scanDurationMs: 0,
      errors: [],
    };

    const start = performance.now();
    const filtered = filterIndexRows(doc.rows, { q: "SECRET_42", kind: "secret" });
    const elapsed = performance.now() - start;

    expect(filtered.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(30);
  });
});
