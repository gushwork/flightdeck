import { describe, expect, it } from "vitest";
import { isCrossSiteWrite, isSameOriginJson } from "./same-origin";

const req = (method: string, headers: Record<string, string> = {}) =>
  new Request("http://127.0.0.1:3325/api/secrets/delete", { method, headers });

describe("isCrossSiteWrite", () => {
  it("lets reads through even from other sites", () => {
    expect(isCrossSiteWrite(req("GET", { "sec-fetch-site": "cross-site", origin: "https://evil.example" }))).toBe(false);
  });

  it("refuses writes a browser marks as cross-site or same-site", () => {
    expect(isCrossSiteWrite(req("POST", { "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(isCrossSiteWrite(req("DELETE", { "sec-fetch-site": "same-site" }))).toBe(true);
  });

  it("refuses writes whose Origin host differs from Host", () => {
    expect(isCrossSiteWrite(req("POST", { origin: "https://evil.example", host: "127.0.0.1:3325" }))).toBe(true);
    expect(isCrossSiteWrite(req("POST", { origin: "null", host: "127.0.0.1:3325" }))).toBe(true);
  });

  it("allows same-origin browser writes and non-browser clients", () => {
    expect(
      isCrossSiteWrite(req("POST", { "sec-fetch-site": "same-origin", origin: "http://127.0.0.1:3325", host: "127.0.0.1:3325" })),
    ).toBe(false);
    expect(isCrossSiteWrite(req("POST"))).toBe(false);
  });
});

describe("isSameOriginJson", () => {
  it("requires a JSON content type", () => {
    expect(isSameOriginJson(req("POST", { "content-type": "text/plain" }))).toBe(false);
    expect(isSameOriginJson(req("POST", { "content-type": "application/json" }))).toBe(true);
  });

  it("refuses JSON from another origin", () => {
    expect(
      isSameOriginJson(req("POST", { "content-type": "application/json", origin: "https://evil.example", host: "127.0.0.1:3325" })),
    ).toBe(false);
  });
});
