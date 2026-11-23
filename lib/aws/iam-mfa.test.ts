import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IAMClient } from "@aws-sdk/client-iam";
import { applyMfaChange, getMfaOverview } from "./iam-mfa";
import { enforceMfaPolicyJson } from "@/lib/iam/mfa";

vi.mock("./sts", () => ({
  getCallerIdentity: vi.fn(async () => ({
    accountId: "123456789012",
    arn: "arn:aws:iam::123456789012:user/me",
  })),
}));

const POLICY_ARN = "arn:aws:iam::123456789012:policy/FlightdeckEnforceMFA";

function awsError(name: string) {
  return Object.assign(new Error(name), { name });
}

/** Minimal in-memory IAM: enough for the commands iam-mfa.ts sends. */
class FakeIam {
  users = ["alice", "bob", "me", "robot"];
  policy: { versions: { id: string; doc: string; created: number }[]; defaultId: string } | null = null;
  attached = new Set<string>();
  groups = new Map<string, string[]>(); // group → members (policy attached to group)
  mfa = new Map<string, number>([["alice", 1]]);
  console = new Set(["alice", "bob", "me"]);
  keys = new Map<string, number>([["robot", 1], ["me", 1]]);
  calls: string[] = [];

  handle(name: string, input: Record<string, unknown>): unknown {
    this.calls.push(name);
    const user = input.UserName as string | undefined;
    switch (name) {
      case "ListUsersCommand":
        return { Users: this.users.map((u) => ({ UserName: u, Arn: `arn:aws:iam::123456789012:user/${u}` })) };
      case "GetPolicyCommand":
        if (!this.policy) throw awsError("NoSuchEntityException");
        return { Policy: { Arn: POLICY_ARN, DefaultVersionId: this.policy.defaultId } };
      case "GetPolicyVersionCommand": {
        const v = this.policy!.versions.find((x) => x.id === input.VersionId)!;
        return { PolicyVersion: { Document: encodeURIComponent(v.doc) } };
      }
      case "ListEntitiesForPolicyCommand":
        if (!this.policy) throw awsError("NoSuchEntityException");
        return {
          PolicyUsers: [...this.attached].map((u) => ({ UserName: u })),
          PolicyGroups: [...this.groups.keys()].map((g) => ({ GroupName: g })),
        };
      case "GetGroupCommand":
        return { Users: (this.groups.get(input.GroupName as string) ?? []).map((u) => ({ UserName: u })) };
      case "ListMFADevicesCommand":
        return { MFADevices: Array.from({ length: this.mfa.get(user!) ?? 0 }, () => ({})) };
      case "GetLoginProfileCommand":
        if (!this.console.has(user!)) throw awsError("NoSuchEntityException");
        return { LoginProfile: { UserName: user } };
      case "ListAccessKeysCommand":
        return {
          AccessKeyMetadata: [
            ...Array.from({ length: this.keys.get(user!) ?? 0 }, () => ({ Status: "Active" })),
            { Status: "Inactive" },
          ],
        };
      case "CreatePolicyCommand":
        this.policy = { versions: [{ id: "v1", doc: input.PolicyDocument as string, created: 1 }], defaultId: "v1" };
        return { Policy: { Arn: POLICY_ARN } };
      case "ListPolicyVersionsCommand":
        return {
          Versions: this.policy!.versions.map((v) => ({
            VersionId: v.id,
            IsDefaultVersion: v.id === this.policy!.defaultId,
            CreateDate: new Date(v.created),
          })),
        };
      case "DeletePolicyVersionCommand":
        this.policy!.versions = this.policy!.versions.filter((v) => v.id !== input.VersionId);
        return {};
      case "CreatePolicyVersionCommand": {
        const id = `v${this.policy!.versions.length + 10}`;
        this.policy!.versions.push({ id, doc: input.PolicyDocument as string, created: Date.now() });
        this.policy!.defaultId = id;
        return {};
      }
      case "AttachUserPolicyCommand":
        if (!this.users.includes(user!)) throw awsError("NoSuchEntityException");
        this.attached.add(user!);
        return {};
      case "DetachUserPolicyCommand":
        this.attached.delete(user!);
        return {};
      default:
        throw new Error(`Unexpected command ${name}`);
    }
  }
}

let iam: FakeIam;

beforeEach(() => {
  iam = new FakeIam();
  vi.spyOn(IAMClient.prototype, "send").mockImplementation((async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) =>
    iam.handle(cmd.constructor.name, cmd.input)) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getMfaOverview", () => {
  it("reports devices, sign-in methods, enforcement and the caller", async () => {
    iam.policy = { versions: [{ id: "v1", doc: enforceMfaPolicyJson(), created: 1 }], defaultId: "v1" };
    iam.attached.add("alice");
    iam.groups.set("Admins", ["bob"]);

    const o = await getMfaOverview("us-east-1");
    expect(o.policy).toMatchObject({ exists: true, upToDate: true, arn: POLICY_ARN });
    expect(o.callerUserName).toBe("me");
    expect(o.warnings).toEqual([]);
    const byName = Object.fromEntries(o.users.map((u) => [u.userName, u]));
    expect(byName.alice).toMatchObject({ mfaDevices: 1, consoleAccess: true, activeAccessKeys: 0, enforcedDirect: true });
    expect(byName.bob).toMatchObject({ enforcedDirect: false, enforcedViaGroups: ["Admins"] });
    expect(byName.robot).toMatchObject({ consoleAccess: false, activeAccessKeys: 1, mfaDevices: 0 });
    expect(byName.me.isCaller).toBe(true);
  });

  it("works before the policy exists", async () => {
    const o = await getMfaOverview("us-east-1");
    expect(o.policy).toMatchObject({ exists: false, upToDate: null });
    expect(o.users.every((u) => !u.enforcedDirect)).toBe(true);
  });
});

describe("applyMfaChange", () => {
  it("creates the policy on first enforce and attaches to every user except the caller", async () => {
    const r = await applyMfaChange("us-east-1", undefined, "enforce", { all: true });
    expect(r.policyCreated).toBe(true);
    expect(iam.policy!.versions[0].doc).toBe(enforceMfaPolicyJson());
    expect([...iam.attached].sort()).toEqual(["alice", "bob", "robot"]);
    expect(r.results.find((x) => x.userName === "me")?.status).toBe("skipped");
    expect(r.results.filter((x) => x.status === "changed")).toHaveLength(3);
  });

  it("does not create the policy when nothing would be attached", async () => {
    const r = await applyMfaChange("us-east-1", undefined, "enforce", { all: false, userNames: ["me"] });
    expect(r.policyCreated).toBe(false);
    expect(iam.policy).toBeNull();
    expect(iam.calls).not.toContain("AttachUserPolicyCommand");
  });

  it("updates a drifted policy, pruning the oldest version when IAM's limit of 5 is reached", async () => {
    iam.policy = {
      versions: [1, 2, 3, 4, 5].map((n) => ({ id: `v${n}`, doc: '{"Version":"2012-10-17","Statement":[]}', created: n })),
      defaultId: "v5",
    };
    const r = await applyMfaChange("us-east-1", undefined, "enforce", { all: false, userNames: ["bob"] });
    expect(r.policyUpdated).toBe(true);
    expect(iam.policy.versions.map((v) => v.id)).not.toContain("v1");
    expect(iam.policy.versions).toHaveLength(5);
    expect(iam.policy.versions.find((v) => v.id === iam.policy!.defaultId)!.doc).toBe(enforceMfaPolicyJson());
  });

  it("reports per-user errors without failing the batch", async () => {
    const r = await applyMfaChange("us-east-1", undefined, "enforce", { all: false, userNames: ["alice", "ghost"] });
    expect(r.results).toEqual([
      { userName: "alice", status: "changed", message: "MFA enforced" },
      { userName: "ghost", status: "error", message: "User not found" },
    ]);
  });

  it("removes direct attachments and leaves the policy in place", async () => {
    await applyMfaChange("us-east-1", undefined, "enforce", { all: false, userNames: ["alice", "bob"] });
    const r = await applyMfaChange("us-east-1", undefined, "remove", { all: false, userNames: ["alice", "robot"] });
    expect(r.results.map((x) => x.status)).toEqual(["changed", "unchanged"]);
    expect([...iam.attached]).toEqual(["bob"]);
    expect(iam.policy).not.toBeNull();
    expect(iam.calls).not.toContain("CreatePolicyVersionCommand");
  });
});
