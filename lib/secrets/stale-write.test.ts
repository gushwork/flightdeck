import { describe, expect, it } from "vitest";
import { staleWriteError } from "./stale-write";

describe("staleWriteError", () => {
  it("allows the write when the loaded version is still current", () => {
    expect(staleWriteError("v1", "v1")).toBeNull();
  });

  it("refuses the write when the secret changed after it was loaded", () => {
    expect(staleWriteError("v1", "v2")).toMatch(/changed after you opened it/);
    expect(staleWriteError("v1", undefined)).toMatch(/current version unknown/);
  });

  it("skips the check for callers that send no version", () => {
    expect(staleWriteError(undefined, "v2")).toBeNull();
    expect(staleWriteError("", "v2")).toBeNull();
    expect(staleWriteError(42, "v2")).toBeNull();
  });
});
