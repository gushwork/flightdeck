import { describe, expect, it } from "vitest";
import {
  MAX_MFA_TARGETS,
  SELF_SKIP_MESSAGE,
  buildEnforceMfaPolicyDocument,
  describeMfaChangeError,
  enforceMfaPolicyArn,
  enforceMfaPolicyJson,
  parseMfaChangeRequest,
  partitionFromArn,
  planMfaChange,
  policyDocumentsEqual,
  summarizeMfaUsers,
  userNameFromArn,
  type IamMfaUserStatus,
} from "./mfa";

describe("buildEnforceMfaPolicyDocument", () => {
  const doc = buildEnforceMfaPolicyDocument();
  const deny = doc.Statement.find((s) => s.Sid === "DenyAllExceptListedIfNoMFA")!;

  it("denies everything else when MFA is absent, including access-key requests", () => {
    expect(deny.Effect).toBe("Deny");
    expect(deny.Resource).toBe("*");
    expect(deny.Condition).toEqual({
      BoolIfExists: { "aws:MultiFactorAuthPresent": "false" },
    });
  });

  it("exempts only sign-in, password change and MFA enrollment calls", () => {
    expect(deny.NotAction).toEqual(
      expect.arrayContaining([
        "iam:ChangePassword",
        "iam:CreateVirtualMFADevice",
        "iam:EnableMFADevice",
        "iam:ListMFADevices",
        "sts:GetSessionToken",
      ]),
    );
    // Removing a device must still need MFA.
    expect(deny.NotAction).not.toContain("iam:DeactivateMFADevice");
    expect(deny.NotAction).not.toContain("iam:DeleteVirtualMFADevice");
  });

  it("scopes self-service to the caller's own user via ${aws:username}", () => {
    const own = doc.Statement.find((s) => s.Sid === "AllowManageOwnUserMFA")!;
    expect(own.Resource).toBe("arn:aws:iam::*:user/${aws:username}");
  });

  it("uses the account partition in ARNs", () => {
    expect(enforceMfaPolicyJson("aws-us-gov")).toContain("arn:aws-us-gov:iam::*:user/${aws:username}");
    expect(enforceMfaPolicyJson("aws-us-gov")).not.toContain("arn:aws:");
  });
});

describe("ARN helpers", () => {
  it("builds the policy ARN", () => {
    expect(enforceMfaPolicyArn("aws", "123456789012")).toBe(
      "arn:aws:iam::123456789012:policy/FlightdeckEnforceMFA",
    );
  });

  it("reads the partition", () => {
    expect(partitionFromArn("arn:aws:sts::123:assumed-role/x/y")).toBe("aws");
    expect(partitionFromArn("arn:aws-cn:iam::123:user/a")).toBe("aws-cn");
    expect(partitionFromArn("garbage")).toBe("aws");
    expect(partitionFromArn(undefined)).toBe("aws");
  });

  it("extracts IAM user names only for user ARNs", () => {
    expect(userNameFromArn("arn:aws:iam::123456789012:user/alice")).toBe("alice");
    expect(userNameFromArn("arn:aws:iam::123456789012:user/team/ops/bob")).toBe("bob");
    expect(userNameFromArn("arn:aws:sts::123456789012:assumed-role/Admin/alice")).toBeNull();
    expect(userNameFromArn("arn:aws:iam::123456789012:root")).toBeNull();
  });
});

describe("policyDocumentsEqual", () => {
  it("ignores whitespace and key order", () => {
    const a = enforceMfaPolicyJson();
    const b = JSON.stringify(
      JSON.parse(a, (_k, v) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? Object.fromEntries(Object.entries(v).reverse())
          : v,
      ),
      null,
      4,
    );
    expect(policyDocumentsEqual(a, b)).toBe(true);
  });

  it("detects content changes and invalid JSON", () => {
    const a = enforceMfaPolicyJson();
    expect(policyDocumentsEqual(a, a.replace("sts:GetSessionToken", "sts:*"))).toBe(false);
    expect(policyDocumentsEqual(a, "{not json")).toBe(false);
  });
});

describe("parseMfaChangeRequest", () => {
  it("accepts allUsers", () => {
    expect(parseMfaChangeRequest({ action: "enforce", allUsers: true })).toEqual({
      ok: true,
      action: "enforce",
      target: { all: true },
    });
  });

  it("trims and de-duplicates user names", () => {
    expect(parseMfaChangeRequest({ action: "remove", userNames: [" alice ", "bob", "alice"] })).toEqual({
      ok: true,
      action: "remove",
      target: { all: false, userNames: ["alice", "bob"] },
    });
  });

  it.each([
    [null, "JSON object"],
    [{ action: "delete", userNames: ["a"] }, "action"],
    [{ action: "enforce" }, "non-empty"],
    [{ action: "enforce", userNames: [] }, "non-empty"],
    [{ action: "enforce", allUsers: true, userNames: ["a"] }, "either"],
    [{ action: "enforce", userNames: ["bad name"] }, "Invalid"],
    [{ action: "enforce", userNames: [42] }, "Invalid"],
    [{ action: "enforce", userNames: ["x".repeat(65)] }, "Invalid"],
    [{ action: "enforce", userNames: Array.from({ length: MAX_MFA_TARGETS + 1 }, (_, i) => `u${i}`) }, "At most"],
  ])("rejects %j", (body, fragment) => {
    const r = parseMfaChangeRequest(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(fragment);
  });
});

describe("planMfaChange", () => {
  const base = {
    directlyAttached: new Set(["direct"]),
    viaGroups: new Map([
      ["grouped", ["Admins"]],
      ["both", ["Admins", "Ops"]],
    ]),
    callerUserName: "me",
  };

  it("never enforces on the user Flightdeck signs in as", () => {
    const [step] = planMfaChange({ ...base, action: "enforce", userNames: ["me"] });
    expect(step.op).toBeNull();
    expect(step.result).toEqual({ userName: "me", status: "skipped", message: SELF_SKIP_MESSAGE });
  });

  it("attaches only where the policy does not already apply", () => {
    const steps = planMfaChange({
      ...base,
      action: "enforce",
      userNames: ["new", "direct", "grouped"],
    });
    expect(steps.map((s) => [s.userName, s.op, s.result.status])).toEqual([
      ["new", "attach", "changed"],
      ["direct", null, "unchanged"],
      ["grouped", null, "unchanged"],
    ]);
    expect(steps[2].result.message).toContain("group Admins");
  });

  it("detaches direct attachments and leaves group enforcement alone", () => {
    const steps = planMfaChange({
      ...base,
      directlyAttached: new Set(["direct", "both", "me"]),
      action: "remove",
      userNames: ["direct", "grouped", "both", "none", "me"],
    });
    expect(steps.map((s) => [s.userName, s.op, s.result.status])).toEqual([
      ["direct", "detach", "changed"],
      ["grouped", null, "skipped"],
      ["both", "detach", "changed"],
      ["none", null, "unchanged"],
      // Removing enforcement from yourself cannot lock you out, so it is allowed.
      ["me", "detach", "changed"],
    ]);
    expect(steps[2].result.message).toContain("still enforced via groups Admins, Ops");
  });
});

describe("summarizeMfaUsers", () => {
  const user = (over: Partial<IamMfaUserStatus>): IamMfaUserStatus => ({
    userName: "u",
    arn: "",
    consoleAccess: true,
    activeAccessKeys: 0,
    mfaDevices: 0,
    enforcedDirect: false,
    enforcedViaGroups: [],
    isCaller: false,
    ...over,
  });

  it("counts enforcement, devices and users waiting to enroll", () => {
    expect(
      summarizeMfaUsers([
        user({ enforcedDirect: true, mfaDevices: 1 }),
        user({ enforcedViaGroups: ["G"], mfaDevices: 0 }),
        user({ mfaDevices: 2 }),
        user({ mfaDevices: null, enforcedDirect: true }),
        user({}),
      ]),
    ).toEqual({ total: 5, enforced: 3, enrolled: 2, awaitingEnrollment: 1 });
  });
});

describe("describeMfaChangeError", () => {
  const err = (name: string, message = "boom") => Object.assign(new Error(message), { name });

  it("maps common IAM errors", () => {
    expect(describeMfaChangeError(err("NoSuchEntityException"))).toBe("User not found");
    expect(describeMfaChangeError(err("LimitExceededException"))).toContain("maximum number of managed policies");
    expect(describeMfaChangeError(err("AccessDenied", "nope"))).toBe("Access denied: nope");
    expect(describeMfaChangeError(err("Throttling", "slow down"))).toBe("slow down");
  });
});
