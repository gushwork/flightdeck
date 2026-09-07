import { describe, expect, it } from "vitest";
import { parallelPool, parallelPoolWithMetrics } from "./parallel-pool";

describe("parallelPool", () => {
  it("preserves result order", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await parallelPool(items, 2, async (n) => n * 2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it("respects concurrency cap", async () => {
    let inFlight = 0;
    let maxConcurrent = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);

    await parallelPool(items, 4, async () => {
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight -= 1;
      return true;
    });

    expect(maxConcurrent).toBeLessThanOrEqual(4);
  });

  it("parallelPoolWithMetrics reports max concurrent", async () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    const { results, maxConcurrent } = await parallelPoolWithMetrics(items, 3, async (n) => {
      await new Promise((r) => setTimeout(r, 5));
      return n;
    });
    expect(results).toHaveLength(12);
    expect(maxConcurrent).toBeLessThanOrEqual(3);
    expect(maxConcurrent).toBeGreaterThan(1);
  });

  it("propagates worker errors", async () => {
    await expect(
      parallelPool([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});
