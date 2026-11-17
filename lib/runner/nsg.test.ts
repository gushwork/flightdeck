import { describe, expect, it } from "vitest";
import { azHint } from "./nsg";

describe("azHint", () => {
  it("treats DNS and connection failures as network problems, not permissions", () => {
    const dns =
      "ERROR: HTTPSConnection(host='management.azure.com', port=443): Failed to resolve 'management.azure.com' ([Errno 8] nodename nor servname provided, or not known)";
    expect(azHint(dns)).toMatch(/Could not reach Azure/);
    expect(azHint("Max retries exceeded with url: /subscriptions")).toMatch(/Could not reach Azure/);
  });

  it("points expired sessions at az login", () => {
    expect(azHint("ERROR: AADSTS700082: The refresh token has expired. Please run 'az login'")).toMatch(/az login/);
  });

  it("points authorization failures at the NSG role", () => {
    expect(azHint("(AuthorizationFailed) The client does not have authorization to perform action")).toMatch(
      /Network Contributor/,
    );
  });

  it("adds nothing for unknown errors", () => {
    expect(azHint("something else")).toBe("");
  });
});
