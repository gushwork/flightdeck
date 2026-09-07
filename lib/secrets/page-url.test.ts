import { describe, expect, it } from "vitest";
import { parseSecretsBrowseFilter, parseSecretsMode, secretsHref } from "./page-url";

describe("secretsHref", () => {
  it("browse default has no query", () => {
    expect(secretsHref()).toBe("/secrets");
    expect(secretsHref({ filter: "all" })).toBe("/secrets");
  });

  it("browse filter and values mode are mutually exclusive", () => {
    expect(secretsHref({ filter: "stale" })).toBe("/secrets?filter=stale");
    expect(secretsHref({ mode: "values", filter: "stale", q: "x" })).toBe(
      "/secrets?mode=values&q=x",
    );
  });

  it("normalizes and encodes a values query", () => {
    expect(secretsHref({ mode: "values", q: "  api key/value  " })).toBe(
      "/secrets?mode=values&q=api+key%2Fvalue",
    );
  });
});

describe("parsers", () => {
  it("accepts known filters and modes", () => {
    expect(parseSecretsBrowseFilter("no-rotation")).toBe("no-rotation");
    expect(parseSecretsBrowseFilter("nope")).toBe("all");
    expect(parseSecretsMode("values")).toBe("values");
    expect(parseSecretsMode(null)).toBe("browse");
  });
});
