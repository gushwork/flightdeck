import { describe, expect, it } from "vitest";
import { legacyDashboardRedirect } from "./legacy-redirect";

describe("legacyDashboardRedirect", () => {
  it("maps hubs without query", () => {
    expect(legacyDashboardRedirect("/aws", {})).toBe("/");
    expect(legacyDashboardRedirect("/github/overview", {})).toBe("/github");
    expect(legacyDashboardRedirect("/secrets/overview", {})).toBe("/secrets");
    expect(legacyDashboardRedirect("/secrets/search", {})).toBe("/secrets?mode=values");
    expect(legacyDashboardRedirect("/amplify/search", {})).toBe("/amplify?mode=search");
  });

  it("forwards q on search routes", () => {
    expect(legacyDashboardRedirect("/secrets/search", { q: "TOKEN" })).toBe(
      "/secrets?mode=values&q=TOKEN",
    );
    expect(legacyDashboardRedirect("/amplify/search", { q: "API_KEY" })).toBe(
      "/amplify?mode=search&q=API_KEY",
    );
  });

  it("encodes q", () => {
    expect(legacyDashboardRedirect("/secrets/search", { q: "a b" })).toBe(
      "/secrets?mode=values&q=a%20b",
    );
  });

  it("ignores array q", () => {
    expect(legacyDashboardRedirect("/secrets/search", { q: ["x", "y"] })).toBe(
      "/secrets?mode=values",
    );
  });
});
