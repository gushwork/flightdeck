import { describe, expect, it } from "vitest";
import { amplifyHref, parseAmplifyMode } from "./page-url";

describe("amplifyHref", () => {
  it("browse has no query", () => {
    expect(amplifyHref()).toBe("/amplify");
  });

  it("search mode forwards q", () => {
    expect(amplifyHref({ mode: "search" })).toBe("/amplify?mode=search");
    expect(amplifyHref({ mode: "search", q: "KEY" })).toBe("/amplify?mode=search&q=KEY");
  });
});

describe("parseAmplifyMode", () => {
  it("defaults to browse", () => {
    expect(parseAmplifyMode(null)).toBe("browse");
    expect(parseAmplifyMode("search")).toBe("search");
  });
});
