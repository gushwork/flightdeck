/**
 * Client-safe MFA enforcement helpers: the policy Flightdeck attaches, DTOs for
 * /api/iam/mfa, request validation and the per-user change plan. No AWS SDK here.
 *
 * AWS has no "require MFA" switch for IAM users. The standard way is a policy that
 * denies every action unless the request was authenticated with MFA, except the
 * few calls a user needs to sign in and register a device. That is what
 * `buildEnforceMfaPolicyDocument` produces; Flightdeck attaches it to each user.
 */

export const ENFORCE_MFA_POLICY_NAME = "FlightdeckEnforceMFA";

export const ENFORCE_MFA_POLICY_DESCRIPTION =
  "Denies all actions except password change and MFA device setup until the user signs in with MFA. Managed by Flightdeck.";

/** Max explicit user names per POST (ListUsers is capped well below this in practice). */
export const MAX_MFA_TARGETS = 1000;

export type MfaAction = "enforce" | "remove";

/** Actions allowed without MFA so a user can sign in, change a forced password, and enroll a device. */
export const MFA_EXEMPT_ACTIONS = [
  "iam:ChangePassword",
  "iam:CreateVirtualMFADevice",
  "iam:EnableMFADevice",
  "iam:GetAccountPasswordPolicy",
  "iam:GetMFADevice",
  "iam:GetUser",
  "iam:ListMFADevices",
  "iam:ListVirtualMFADevices",
  "iam:ResyncMFADevice",
  "sts:GetSessionToken",
] as const;

/**
 * Policy document for `FlightdeckEnforceMFA` (AWS's "force MFA" pattern).
 *
 * - The allow statements let users manage only their own password and MFA devices,
 *   so the policy works even for users with no other IAM permissions.
 * - `DenyAllExceptListedIfNoMFA` uses `BoolIfExists`: requests signed with long-term
 *   access keys carry no MFA context and are denied too. CLI users must call
 *   `sts:GetSessionToken` with their MFA code and use the temporary credentials.
 * - `iam:ChangePassword` and `iam:GetAccountPasswordPolicy` are exempt so users created
 *   with a forced password reset (see Create user) can finish their first sign-in.
 *   Deactivating an MFA device still requires MFA.
 */
export function buildEnforceMfaPolicyDocument(partition = "aws") {
  const ownUser = `arn:${partition}:iam::*:user/\${aws:username}`;
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "AllowViewAccountInfo",
        Effect: "Allow",
        Action: ["iam:GetAccountPasswordPolicy", "iam:ListVirtualMFADevices"],
        Resource: "*",
      },
      {
        Sid: "AllowManageOwnPassword",
        Effect: "Allow",
        Action: ["iam:ChangePassword", "iam:GetUser"],
        Resource: ownUser,
      },
      {
        Sid: "AllowManageOwnVirtualMFADevice",
        Effect: "Allow",
        Action: ["iam:CreateVirtualMFADevice"],
        Resource: `arn:${partition}:iam::*:mfa/*`,
      },
      {
        Sid: "AllowManageOwnUserMFA",
        Effect: "Allow",
        Action: [
          "iam:DeactivateMFADevice",
          "iam:EnableMFADevice",
          "iam:GetMFADevice",
          "iam:ListMFADevices",
          "iam:ResyncMFADevice",
        ],
        Resource: ownUser,
      },
      {
        Sid: "DenyAllExceptListedIfNoMFA",
        Effect: "Deny",
        NotAction: [...MFA_EXEMPT_ACTIONS],
        Resource: "*",
        Condition: {
          BoolIfExists: { "aws:MultiFactorAuthPresent": "false" },
        },
      },
    ],
  };
}

export function enforceMfaPolicyJson(partition = "aws"): string {
  return JSON.stringify(buildEnforceMfaPolicyDocument(partition));
}

export function enforceMfaPolicyArn(partition: string, accountId: string): string {
  return `arn:${partition}:iam::${accountId}:policy/${ENFORCE_MFA_POLICY_NAME}`;
}

/** `arn:aws-us-gov:sts::…` → `aws-us-gov`; defaults to `aws`. */
export function partitionFromArn(arn: string | undefined): string {
  const p = arn?.split(":")[1];
  return p && /^aws(-[a-z-]+)?$/.test(p) ? p : "aws";
}

/** IAM user name from `arn:aws:iam::123:user/path/name`; null for roles, root and others. */
export function userNameFromArn(arn: string | undefined): string | null {
  const m = /^arn:[^:]+:iam::\d+:user\/(.+)$/.exec(arn ?? "");
  if (!m) return null;
  const name = m[1].split("/").pop();
  return name || null;
}

export function isValidIamUserName(name: string): boolean {
  return /^[\w+=,.@-]{1,64}$/.test(name);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonicalize((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/** Compare two policy JSON strings ignoring whitespace and key order. Invalid JSON never matches. */
export function policyDocumentsEqual(a: string, b: string): boolean {
  try {
    return (
      JSON.stringify(canonicalize(JSON.parse(a))) ===
      JSON.stringify(canonicalize(JSON.parse(b)))
    );
  } catch {
    return false;
  }
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface IamMfaUserStatus {
  userName: string;
  arn: string;
  createdAt?: string;
  passwordLastUsed?: string;
  /** Has a console password (login profile). null = could not read. */
  consoleAccess: boolean | null;
  /** Active access keys. null = could not read. */
  activeAccessKeys: number | null;
  /** Registered MFA devices (virtual, hardware, passkey). null = could not read. */
  mfaDevices: number | null;
  /** FlightdeckEnforceMFA attached to the user directly. */
  enforcedDirect: boolean;
  /** Groups the user belongs to that have FlightdeckEnforceMFA attached. */
  enforcedViaGroups: string[];
  /** The IAM user Flightdeck is signed in as for this profile. */
  isCaller: boolean;
}

export interface IamMfaPolicyState {
  name: string;
  arn: string;
  exists: boolean;
  /** Default version matches the document Flightdeck writes; null when the policy does not exist. */
  upToDate: boolean | null;
}

export interface IamMfaOverview {
  accountId: string;
  partition: string;
  callerArn: string;
  /** Set when the profile signs in as an IAM user (not a role / SSO session). */
  callerUserName: string | null;
  policy: IamMfaPolicyState;
  users: IamMfaUserStatus[];
  truncated: boolean;
  warnings: string[];
}

export type MfaChangeStatus = "changed" | "unchanged" | "skipped" | "error";

export interface MfaChangeResult {
  userName: string;
  status: MfaChangeStatus;
  message?: string;
}

export interface MfaChangeResponse {
  action: MfaAction;
  policyArn: string;
  policyCreated: boolean;
  policyUpdated: boolean;
  results: MfaChangeResult[];
  warnings: string[];
}

export function isEnforced(u: Pick<IamMfaUserStatus, "enforcedDirect" | "enforcedViaGroups">): boolean {
  return u.enforcedDirect || u.enforcedViaGroups.length > 0;
}

export interface MfaSummary {
  total: number;
  enforced: number;
  enrolled: number;
  /** Enforced but no MFA device yet: can sign in, can do nothing else. */
  awaitingEnrollment: number;
}

export function summarizeMfaUsers(users: IamMfaUserStatus[]): MfaSummary {
  let enforced = 0;
  let enrolled = 0;
  let awaitingEnrollment = 0;
  for (const u of users) {
    const on = isEnforced(u);
    const hasDevice = (u.mfaDevices ?? 0) > 0;
    if (on) enforced++;
    if (hasDevice) enrolled++;
    if (on && u.mfaDevices === 0) awaitingEnrollment++;
  }
  return { total: users.length, enforced, enrolled, awaitingEnrollment };
}

// ─── Request validation ──────────────────────────────────────────────────────

export type MfaChangeTarget = { all: true } | { all: false; userNames: string[] };

export type ParsedMfaChangeRequest =
  | { ok: true; action: MfaAction; target: MfaChangeTarget }
  | { ok: false; error: string };

/** Validate the POST body of /api/iam/mfa: `{ action, allUsers? , userNames? }`. */
export function parseMfaChangeRequest(body: unknown): ParsedMfaChangeRequest {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;
  if (b.action !== "enforce" && b.action !== "remove") {
    return { ok: false, error: 'action must be "enforce" or "remove"' };
  }
  const action = b.action;
  if (b.allUsers === true) {
    if (b.userNames !== undefined) {
      return { ok: false, error: "Send either allUsers or userNames, not both" };
    }
    return { ok: true, action, target: { all: true } };
  }
  if (!Array.isArray(b.userNames) || b.userNames.length === 0) {
    return { ok: false, error: "userNames must be a non-empty array (or set allUsers: true)" };
  }
  if (b.userNames.length > MAX_MFA_TARGETS) {
    return { ok: false, error: `At most ${MAX_MFA_TARGETS} users per request` };
  }
  const names: string[] = [];
  for (const raw of b.userNames) {
    const name = typeof raw === "string" ? raw.trim() : "";
    if (!isValidIamUserName(name)) {
      return { ok: false, error: `Invalid IAM user name: ${JSON.stringify(raw)}` };
    }
    if (!names.includes(name)) names.push(name);
  }
  return { ok: true, action, target: { all: false, userNames: names } };
}

// ─── Change plan ─────────────────────────────────────────────────────────────

export interface MfaPlanInput {
  action: MfaAction;
  userNames: string[];
  /** Users with the policy attached directly. */
  directlyAttached: ReadonlySet<string>;
  /** User → groups (with the policy attached) they belong to. */
  viaGroups: ReadonlyMap<string, string[]>;
  callerUserName: string | null;
}

export interface MfaPlanStep {
  userName: string;
  /** API call to make; null means the result is already decided. */
  op: "attach" | "detach" | null;
  /** Final result when op is null; message to report on success otherwise. */
  result: MfaChangeResult;
}

export const SELF_SKIP_MESSAGE =
  "Flightdeck signs in as this user. Enforcing MFA on it would deny Flightdeck's own AWS calls — set up MFA and attach the policy in the AWS console instead.";

function groupList(groups: string[]): string {
  return groups.length === 1 ? `group ${groups[0]}` : `groups ${groups.join(", ")}`;
}

/** Decide, per user, whether to attach, detach or leave the policy. Pure; no AWS calls. */
export function planMfaChange(input: MfaPlanInput): MfaPlanStep[] {
  return input.userNames.map((userName): MfaPlanStep => {
    const direct = input.directlyAttached.has(userName);
    const groups = input.viaGroups.get(userName) ?? [];

    if (input.action === "enforce") {
      if (input.callerUserName && userName === input.callerUserName) {
        return { userName, op: null, result: { userName, status: "skipped", message: SELF_SKIP_MESSAGE } };
      }
      if (direct) {
        return { userName, op: null, result: { userName, status: "unchanged", message: "Already enforced" } };
      }
      if (groups.length > 0) {
        return {
          userName,
          op: null,
          result: { userName, status: "unchanged", message: `Already enforced via ${groupList(groups)}` },
        };
      }
      return { userName, op: "attach", result: { userName, status: "changed", message: "MFA enforced" } };
    }

    if (!direct) {
      if (groups.length > 0) {
        return {
          userName,
          op: null,
          result: {
            userName,
            status: "skipped",
            message: `Enforced via ${groupList(groups)} — remove the user from the group or detach the policy from it in the AWS console`,
          },
        };
      }
      return { userName, op: null, result: { userName, status: "unchanged", message: "Not enforced" } };
    }
    return {
      userName,
      op: "detach",
      result: {
        userName,
        status: "changed",
        message:
          groups.length > 0
            ? `Direct policy removed; still enforced via ${groupList(groups)}`
            : "Enforcement removed",
      },
    };
  });
}

/** Turn an AWS SDK error from Attach/DetachUserPolicy into an operator-facing message. */
export function describeMfaChangeError(err: unknown): string {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  const message = err instanceof Error ? err.message : String(err);
  if (name === "NoSuchEntityException" || name === "NoSuchEntity") return "User not found";
  if (name === "LimitExceededException" || name === "LimitExceeded") {
    return "User already has the maximum number of managed policies attached — detach one first";
  }
  if (name === "AccessDeniedException" || name === "AccessDenied") {
    return `Access denied: ${message}`;
  }
  return message || "Unknown error";
}
