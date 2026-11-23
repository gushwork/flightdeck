import {
  AttachUserPolicyCommand,
  CreatePolicyCommand,
  CreatePolicyVersionCommand,
  DeletePolicyVersionCommand,
  DetachUserPolicyCommand,
  GetGroupCommand,
  GetLoginProfileCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand,
  IAMClient,
  ListAccessKeysCommand,
  ListEntitiesForPolicyCommand,
  ListMFADevicesCommand,
  ListPolicyVersionsCommand,
  ListUsersCommand,
  type User,
} from '@aws-sdk/client-iam';
import { awsClientOptions } from './client';
import { getCallerIdentity } from './sts';
import { parallelPool } from '@/lib/github/parallel-pool';
import {
  ENFORCE_MFA_POLICY_DESCRIPTION,
  ENFORCE_MFA_POLICY_NAME,
  describeMfaChangeError,
  enforceMfaPolicyArn,
  enforceMfaPolicyJson,
  partitionFromArn,
  planMfaChange,
  policyDocumentsEqual,
  userNameFromArn,
  type IamMfaOverview,
  type IamMfaUserStatus,
  type MfaAction,
  type MfaChangeResponse,
  type MfaChangeResult,
  type MfaChangeTarget,
} from '@/lib/iam/mfa';

const MAX_LIST_PAGES = 50;
/** Per-user status reads (3 IAM calls each) run this many users at a time. */
const STATUS_CONCURRENCY = 6;
/** Attach/detach calls in flight at once. */
const WRITE_CONCURRENCY = 4;
/** IAM keeps at most 5 versions of a managed policy. */
const MAX_POLICY_VERSIONS = 5;

function errorName(err: unknown): string {
  return err && typeof err === 'object' && 'name' in err
    ? String((err as { name: unknown }).name)
    : '';
}

function isNoSuchEntity(err: unknown): boolean {
  return errorName(err) === 'NoSuchEntityException';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function decodePolicyDocument(raw: string | undefined): string {
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function listAllUsers(
  client: IAMClient,
): Promise<{ users: User[]; truncated: boolean }> {
  const users: User[] = [];
  let marker: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const resp = await client.send(
      new ListUsersCommand({ Marker: marker, MaxItems: 100 }),
    );
    users.push(...(resp.Users ?? []));
    if (!resp.IsTruncated) return { users, truncated: false };
    marker = resp.Marker;
  }
  return { users, truncated: true };
}

interface PolicyState {
  exists: boolean;
  upToDate: boolean | null;
}

async function readPolicyState(
  client: IAMClient,
  policyArn: string,
  partition: string,
): Promise<PolicyState> {
  try {
    const pol = await client.send(new GetPolicyCommand({ PolicyArn: policyArn }));
    const versionId = pol.Policy?.DefaultVersionId;
    if (!versionId) return { exists: true, upToDate: false };
    const ver = await client.send(
      new GetPolicyVersionCommand({ PolicyArn: policyArn, VersionId: versionId }),
    );
    const current = decodePolicyDocument(ver.PolicyVersion?.Document);
    return {
      exists: true,
      upToDate: policyDocumentsEqual(current, enforceMfaPolicyJson(partition)),
    };
  } catch (err) {
    if (isNoSuchEntity(err)) return { exists: false, upToDate: null };
    throw err;
  }
}

interface PolicyAttachments {
  users: Set<string>;
  /** User → groups (that carry the policy) they are a member of. */
  viaGroups: Map<string, string[]>;
}

/** Who has the policy: direct user attachments plus members of groups it is attached to. */
async function readPolicyAttachments(
  client: IAMClient,
  policyArn: string,
): Promise<PolicyAttachments> {
  const users = new Set<string>();
  const groups: string[] = [];
  let marker: string | undefined;
  try {
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const resp = await client.send(
        new ListEntitiesForPolicyCommand({ PolicyArn: policyArn, Marker: marker }),
      );
      for (const u of resp.PolicyUsers ?? []) if (u.UserName) users.add(u.UserName);
      for (const g of resp.PolicyGroups ?? []) if (g.GroupName) groups.push(g.GroupName);
      if (!resp.IsTruncated) break;
      marker = resp.Marker;
    }
  } catch (err) {
    if (isNoSuchEntity(err)) return { users, viaGroups: new Map() };
    throw err;
  }

  const viaGroups = new Map<string, string[]>();
  for (const groupName of groups) {
    let gMarker: string | undefined;
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const resp = await client.send(
        new GetGroupCommand({ GroupName: groupName, Marker: gMarker }),
      );
      for (const u of resp.Users ?? []) {
        if (!u.UserName) continue;
        viaGroups.set(u.UserName, [...(viaGroups.get(u.UserName) ?? []), groupName]);
      }
      if (!resp.IsTruncated) break;
      gMarker = resp.Marker;
    }
  }
  return { users, viaGroups };
}

interface UserCredentialState {
  consoleAccess: boolean | null;
  activeAccessKeys: number | null;
  mfaDevices: number | null;
  errors: { kind: 'console' | 'keys' | 'mfa'; message: string }[];
}

async function readUserCredentials(
  client: IAMClient,
  userName: string,
): Promise<UserCredentialState> {
  const [mfa, login, keys] = await Promise.allSettled([
    client.send(new ListMFADevicesCommand({ UserName: userName })),
    client.send(new GetLoginProfileCommand({ UserName: userName })),
    client.send(new ListAccessKeysCommand({ UserName: userName })),
  ]);
  const errors: UserCredentialState['errors'] = [];

  let mfaDevices: number | null = null;
  if (mfa.status === 'fulfilled') mfaDevices = mfa.value.MFADevices?.length ?? 0;
  else errors.push({ kind: 'mfa', message: errorMessage(mfa.reason) });

  let consoleAccess: boolean | null = null;
  if (login.status === 'fulfilled') consoleAccess = true;
  else if (isNoSuchEntity(login.reason)) consoleAccess = false;
  else errors.push({ kind: 'console', message: errorMessage(login.reason) });

  let activeAccessKeys: number | null = null;
  if (keys.status === 'fulfilled') {
    activeAccessKeys = (keys.value.AccessKeyMetadata ?? []).filter(
      (k) => k.Status === 'Active',
    ).length;
  } else errors.push({ kind: 'keys', message: errorMessage(keys.reason) });

  return { consoleAccess, activeAccessKeys, mfaDevices, errors };
}

const CREDENTIAL_LABEL = {
  mfa: 'MFA devices',
  console: 'console access',
  keys: 'access keys',
} as const;

/** Every IAM user with MFA device, sign-in methods and enforcement state. Read-only. */
export async function getMfaOverview(
  region: string,
  profile?: string,
): Promise<IamMfaOverview> {
  const client = new IAMClient(awsClientOptions(region, profile));
  const caller = await getCallerIdentity(region, profile);
  const partition = partitionFromArn(caller.arn);
  const callerUserName = userNameFromArn(caller.arn);
  const policyArn = enforceMfaPolicyArn(partition, caller.accountId);

  const [{ users, truncated }, policyState, attachments] = await Promise.all([
    listAllUsers(client),
    readPolicyState(client, policyArn, partition),
    readPolicyAttachments(client, policyArn),
  ]);

  const failures: Record<keyof typeof CREDENTIAL_LABEL, { count: number; first: string }> = {
    mfa: { count: 0, first: '' },
    console: { count: 0, first: '' },
    keys: { count: 0, first: '' },
  };

  const rows = await parallelPool(
    users.filter((u): u is User & { UserName: string } => Boolean(u.UserName)),
    STATUS_CONCURRENCY,
    async (u): Promise<IamMfaUserStatus> => {
      const creds = await readUserCredentials(client, u.UserName);
      for (const e of creds.errors) {
        const f = failures[e.kind];
        if (f.count++ === 0) f.first = e.message;
      }
      return {
        userName: u.UserName,
        arn: u.Arn ?? '',
        createdAt: u.CreateDate?.toISOString(),
        passwordLastUsed: u.PasswordLastUsed?.toISOString(),
        consoleAccess: creds.consoleAccess,
        activeAccessKeys: creds.activeAccessKeys,
        mfaDevices: creds.mfaDevices,
        enforcedDirect: attachments.users.has(u.UserName),
        enforcedViaGroups: attachments.viaGroups.get(u.UserName) ?? [],
        isCaller: callerUserName === u.UserName,
      };
    },
  );

  const warnings: string[] = [];
  if (truncated) {
    warnings.push(`Only the first ${MAX_LIST_PAGES * 100} users are listed.`);
  }
  for (const kind of Object.keys(failures) as (keyof typeof failures)[]) {
    const f = failures[kind];
    if (f.count > 0) {
      warnings.push(
        `Could not read ${CREDENTIAL_LABEL[kind]} for ${f.count} user${f.count === 1 ? '' : 's'}: ${f.first}`,
      );
    }
  }

  return {
    accountId: caller.accountId,
    partition,
    callerArn: caller.arn,
    callerUserName,
    policy: {
      name: ENFORCE_MFA_POLICY_NAME,
      arn: policyArn,
      exists: policyState.exists,
      upToDate: policyState.upToDate,
    },
    users: rows.sort((a, b) => a.userName.localeCompare(b.userName)),
    truncated,
    warnings,
  };
}

/** Create the policy, or move it to the current document when it drifted. */
async function ensureEnforceMfaPolicy(
  client: IAMClient,
  policyArn: string,
  partition: string,
  state: PolicyState,
): Promise<{ created: boolean; updated: boolean }> {
  const document = enforceMfaPolicyJson(partition);
  if (!state.exists) {
    try {
      await client.send(
        new CreatePolicyCommand({
          PolicyName: ENFORCE_MFA_POLICY_NAME,
          Path: '/',
          PolicyDocument: document,
          Description: ENFORCE_MFA_POLICY_DESCRIPTION,
          Tags: [{ Key: 'managed-by', Value: 'flightdeck' }],
        }),
      );
      return { created: true, updated: false };
    } catch (err) {
      // Created concurrently (another tab / operator): fall through to the drift check.
      if (errorName(err) !== 'EntityAlreadyExistsException') throw err;
      const again = await readPolicyState(client, policyArn, partition);
      if (again.upToDate) return { created: false, updated: false };
    }
  } else if (state.upToDate) {
    return { created: false, updated: false };
  }

  const versions = await client.send(
    new ListPolicyVersionsCommand({ PolicyArn: policyArn }),
  );
  const list = versions.Versions ?? [];
  if (list.length >= MAX_POLICY_VERSIONS) {
    const oldest = list
      .filter((v) => !v.IsDefaultVersion && v.VersionId)
      .sort((a, b) => (a.CreateDate?.getTime() ?? 0) - (b.CreateDate?.getTime() ?? 0))[0];
    if (oldest?.VersionId) {
      await client.send(
        new DeletePolicyVersionCommand({ PolicyArn: policyArn, VersionId: oldest.VersionId }),
      );
    }
  }
  await client.send(
    new CreatePolicyVersionCommand({
      PolicyArn: policyArn,
      PolicyDocument: document,
      SetAsDefault: true,
    }),
  );
  return { created: false, updated: true };
}

/**
 * Enforce or remove MFA for the given users (or every user) by attaching / detaching
 * FlightdeckEnforceMFA. Never enforces on the IAM user this profile signs in as.
 */
export async function applyMfaChange(
  region: string,
  profile: string | undefined,
  action: MfaAction,
  target: MfaChangeTarget,
): Promise<MfaChangeResponse> {
  const client = new IAMClient(awsClientOptions(region, profile));
  const caller = await getCallerIdentity(region, profile);
  const partition = partitionFromArn(caller.arn);
  const policyArn = enforceMfaPolicyArn(partition, caller.accountId);
  const warnings: string[] = [];

  let userNames: string[];
  if (target.all) {
    const { users, truncated } = await listAllUsers(client);
    userNames = users.map((u) => u.UserName).filter((n): n is string => Boolean(n));
    if (truncated) {
      warnings.push(
        `Only the first ${MAX_LIST_PAGES * 100} users were processed; run again for the rest.`,
      );
    }
  } else {
    userNames = target.userNames;
  }

  const [state, attachments] = await Promise.all([
    readPolicyState(client, policyArn, partition),
    readPolicyAttachments(client, policyArn),
  ]);

  const plan = planMfaChange({
    action,
    userNames,
    directlyAttached: attachments.users,
    viaGroups: attachments.viaGroups,
    callerUserName: userNameFromArn(caller.arn),
  });

  let policyCreated = false;
  let policyUpdated = false;
  const needsPolicy = plan.some((s) => s.op === 'attach');
  if (action === 'enforce' && (needsPolicy || state.exists)) {
    const ensured = await ensureEnforceMfaPolicy(client, policyArn, partition, state);
    policyCreated = ensured.created;
    policyUpdated = ensured.updated;
  }

  const results = await parallelPool(
    plan,
    WRITE_CONCURRENCY,
    async (step): Promise<MfaChangeResult> => {
      if (!step.op) return step.result;
      try {
        if (step.op === 'attach') {
          await client.send(
            new AttachUserPolicyCommand({ UserName: step.userName, PolicyArn: policyArn }),
          );
        } else {
          await client.send(
            new DetachUserPolicyCommand({ UserName: step.userName, PolicyArn: policyArn }),
          );
        }
        return step.result;
      } catch (err) {
        return { userName: step.userName, status: 'error', message: describeMfaChangeError(err) };
      }
    },
  );

  return { action, policyArn, policyCreated, policyUpdated, results, warnings };
}
