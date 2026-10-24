import { describe, expect, it } from "vitest";
import { cidrToString, parseCidr } from "@/lib/vpc/cidr";
import { buildCells, cellPrefixFor, suggestLayout } from "@/lib/vpc/planner";

const c = (s: string) => parseCidr(s)!;

describe("planner", () => {
  it("never exceeds 256 cells", () => {
    expect(cellPrefixFor(c("10.0.0.0/16"))).toBe(24);
    expect(buildCells(c("10.0.0.0/16"), [])).toHaveLength(256);
    expect(buildCells(c("10.0.0.0/28"), [])).toHaveLength(16);
  });

  it("marks full and partial coverage", () => {
    const cells = buildCells(c("10.0.0.0/16"), [
      { id: "a", name: "a", cidr: c("10.0.0.0/23"), tier: "public" },
      { id: "b", name: "b", cidr: c("10.0.4.0/28"), tier: "private" },
    ]);
    expect(cells[0]).toMatchObject({ coverage: "full" });
    expect(cells[1]).toMatchObject({ coverage: "full" });
    expect(cells[2]).toMatchObject({ coverage: "free" });
    expect(cells[4]).toMatchObject({ coverage: "partial", owner: { id: "b" } });
  });

  it("suggests non-overlapping tier-major layout", () => {
    const layout = suggestLayout(c("10.0.0.0/16"), [c("10.0.0.0/24")], ["public", "private"], ["a", "b"], 24);
    expect(layout.map((b) => `${b.tier}-${b.az}=${b.cidr && cidrToString(b.cidr)}`)).toEqual([
      "public-a=10.0.1.0/24",
      "public-b=10.0.2.0/24",
      "private-a=10.0.3.0/24",
      "private-b=10.0.4.0/24",
    ]);
  });

  it("reports when there is no room", () => {
    const layout = suggestLayout(c("10.0.0.0/24"), [], ["a"], ["x", "y", "z"], 25);
    expect(layout.map((b) => !!b.cidr)).toEqual([true, true, false]);
  });
});
