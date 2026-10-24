import { describe, expect, it } from "vitest";
import {
  cidrToString,
  freeBlocks,
  freeBlocksOfSize,
  intToIp,
  ipToInt,
  isNormalized,
  overlaps,
  parseCidr,
} from "@/lib/vpc/cidr";

const c = (s: string) => parseCidr(s)!;

describe("cidr", () => {
  it("round-trips ip and int", () => {
    expect(intToIp(ipToInt("10.20.30.40")!)).toBe("10.20.30.40");
    expect(ipToInt("255.255.255.255")).toBe(2 ** 32 - 1);
    expect(ipToInt("256.0.0.1")).toBeNull();
    expect(ipToInt("1.2.3")).toBeNull();
  });

  it("parses and normalises", () => {
    expect(cidrToString(c("10.0.5.9/24"))).toBe("10.0.5.0/24");
    expect(parseCidr("10.0.0.0")).toBeNull();
    expect(parseCidr("10.0.0.0/33")).toBeNull();
    expect(isNormalized("10.0.5.0/24")).toBe(true);
    expect(isNormalized("10.0.5.9/24")).toBe(false);
  });

  it("detects overlap", () => {
    expect(overlaps(c("10.0.0.0/16"), c("10.0.5.0/24"))).toBe(true);
    expect(overlaps(c("10.0.0.0/24"), c("10.0.1.0/24"))).toBe(false);
  });

  it("finds maximal free blocks", () => {
    const free = freeBlocks(c("10.0.0.0/24"), [c("10.0.0.0/26")]);
    expect(free.map(cidrToString)).toEqual(["10.0.0.64/26", "10.0.0.128/25"]);
    expect(freeBlocks(c("10.0.0.0/24"), [c("10.0.0.0/24")])).toEqual([]);
  });

  it("finds aligned blocks of a size", () => {
    const blocks = freeBlocksOfSize(c("10.0.0.0/16"), [c("10.0.0.0/24"), c("10.0.2.0/24")], 24, 3);
    expect(blocks.map(cidrToString)).toEqual(["10.0.1.0/24", "10.0.3.0/24", "10.0.4.0/24"]);
    expect(freeBlocksOfSize(c("10.0.0.0/24"), [c("10.0.0.128/25")], 25, 5).map(cidrToString)).toEqual(["10.0.0.0/25"]);
    expect(freeBlocksOfSize(c("10.0.0.0/24"), [], 16)).toEqual([]);
  });
});
