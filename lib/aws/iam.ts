import {
  AddRoleToInstanceProfileCommand,
  AddUserToGroupCommand,
  AttachGroupPolicyCommand,
  AttachRolePolicyCommand,
  AttachUserPolicyCommand,
  CreateGroupCommand,
  CreateInstanceProfileCommand,
  CreatePolicyCommand,
  CreatePolicyVersionCommand,
  CreateRoleCommand,
  CreateUserCommand,
  DeleteGroupPolicyCommand,
  DeleteRolePolicyCommand,
  DeleteUserPolicyCommand,
  DetachGroupPolicyCommand,
  DetachRolePolicyCommand,
  DetachUserPolicyCommand,
  GetGroupCommand,
  GetGroupPolicyCommand,
  GetInstanceProfileCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand,
  GetRoleCommand,
  GetRolePolicyCommand,
  GetUserCommand,
  GetUserPolicyCommand,
  IAMClient,
  ListAttachedGroupPoliciesCommand,
  ListAttachedRolePoliciesCommand,
  ListAttachedUserPoliciesCommand,
  ListEntitiesForPolicyCommand,
  ListGroupPoliciesCommand,
  ListGroupsForUserCommand,
  ListInstanceProfilesForRoleCommand,
  ListPoliciesCommand,
  ListPolicyVersionsCommand,
  ListRolePoliciesCommand,
  ListRoleTagsCommand,
  ListRolesCommand,
  ListUserPoliciesCommand,
  ListUsersCommand,
  PutGroupPolicyCommand,
  PutRolePermissionsBoundaryCommand,
  PutRolePolicyCommand,
  PutUserPermissionsBoundaryCommand,
  PutUserPolicyCommand,
  RemoveUserFromGroupCommand,
  TagRoleCommand,
  UpdateAssumeRolePolicyCommand,
  CreateAccessKeyCommand,
  CreateLoginProfileCommand,
  DeleteAccessKeyCommand,
  DeleteLoginProfileCommand,
  DeleteUserCommand,
  DeleteUserPermissionsBoundaryCommand,
  GetAccountPasswordPolicyCommand,
  ListAccountAliasesCommand,
  type PasswordPolicy,
} from '@aws-sdk/client-iam';
import { awsClientOptions } from './client';
import { getAccountId } from './sts';

const MAX_LIST_PAGES = 50;
/** Policies can be deep in alphabetical list — allow more pages for ListPolicies. */
const MAX_POLICY_LIST_PAGES = 100;
const MAX_MATCHES_PER_TYPE = 80;
/** Inline policies require ListRolePolicies / ListUserPolicies per entity — cap scans. */
const MAX_INLINE_SCAN_ROLES = 250;
const MAX_INLINE_SCAN_USERS = 250;
/** Max principals copied when deep-copying a managed policy (ListEntitiesForPolicy). */
const MAX_DEEP_POLICY_PRINCIPALS = 40;

export type IamEntityType = 'role' | 'user' | 'policy' | 'group';

export interface IamInlinePolicySource {
  kind: 'role' | 'user';
  parentName: string;
  policyName: string;
}

export interface IamSearchHit {
  type: IamEntityType;
  name: string;
  path: string;
  arn: string;
  /** Customer inline policy on a role or user (not listed by ListPolicies). */
  inlineParent?: { kind: 'role' | 'user'; name: string };
}

export interface IamSearchResult {
  results: IamSearchHit[];
  truncated: boolean;
}

export interface ListIamUsersResult {
  users: string[];
  truncated: boolean;
}

export interface ProvisionedIamUser {
  signInUrl: string;
  username: string;
  password: string;
  accessKeyId: string;
  secretAccessKey: string;
  userArn?: string;
  warnings?: string[];
}

function getIamClient(region: string, profile?: string) {
  return new IAMClient(awsClientOptions(region, profile));
}

function isNoSuchEntity(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'NoSuchEntityException'
  );
}

function matchesQuery(
  query: string,
  ...parts: (string | undefined)[]
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return parts.some((p) => (p ?? '').toLowerCase().includes(q));
}

/** IAM policy name (customer-managed); root path lookup. */
function looksLikeSinglePolicyNameSegment(query: string): boolean {
  const q = query.trim();
  if (q.length < 1 || q.length > 128) return false;
  return /^[\w+=,.@-]+$/.test(q);
}

function decodePolicyDocument(raw: string | undefined): string {
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Replace source account id with target in trust / policy JSON strings. */
export function rewriteAccountIdsInPolicyDocument(
  document: string,
  sourceAccountId: string,
  targetAccountId: string,
): string {
  if (sourceAccountId === targetAccountId) return document;
  let d = document.replaceAll(sourceAccountId, targetAccountId);
  d = d.replace(
    /arn:aws:iam::(\d+):/g,
    (_m, acct: string) =>
      `arn:aws:iam::${acct === sourceAccountId ? targetAccountId : acct}:`,
  );
  return d;
}

export function buildTargetPolicyArn(
  sourcePolicyArn: string,
  targetAccountId: string,
): string {
  return sourcePolicyArn.replace(
    /arn:aws:iam::\d+:/,
    `arn:aws:iam::${targetAccountId}:`,
  );
}

export async function searchIamEntities(
  region: string,
  profile: string | undefined,
  query: string,
  types: IamEntityType[] | undefined,
): Promise<IamSearchResult> {
  const want = types?.length
    ? new Set(types)
    : new Set<IamEntityType>(['role', 'user', 'policy']);
  const roleHits: IamSearchHit[] = [];
  const userHits: IamSearchHit[] = [];
  const policyHits: IamSearchHit[] = [];
  const seenPolicyArns = new Set<string>();
  let truncated = false;
  const client = getIamClient(region, profile);

  const pushRole = (hit: IamSearchHit) => {
    if (roleHits.length >= MAX_MATCHES_PER_TYPE) {
      truncated = true;
      return;
    }
    if (
      matchesQuery(query, hit.name, hit.path, hit.arn, hit.name.split('/').pop())
    ) {
      roleHits.push(hit);
    }
  };

  const pushUser = (hit: IamSearchHit) => {
    if (userHits.length >= MAX_MATCHES_PER_TYPE) {
      truncated = true;
      return;
    }
    if (
      matchesQuery(query, hit.name, hit.path, hit.arn, hit.name.split('/').pop())
    ) {
      userHits.push(hit);
    }
  };

  const policyMatchParts = (hit: IamSearchHit) =>
    [
      hit.name,
      hit.path,
      hit.arn,
      hit.name.split('/').pop(),
      hit.inlineParent?.name,
      hit.inlineParent
        ? `${hit.inlineParent.kind} ${hit.inlineParent.name}`
        : undefined,
    ];

  const pushPolicy = (hit: IamSearchHit) => {
    if (seenPolicyArns.has(hit.arn)) return;
    if (policyHits.length >= MAX_MATCHES_PER_TYPE) {
      truncated = true;
      return;
    }
    if (matchesQuery(query, ...policyMatchParts(hit))) {
      policyHits.push(hit);
      seenPolicyArns.add(hit.arn);
    }
  };

  if (want.has('role')) {
    let marker: string | undefined;
    let pages = 0;
    let lastTruncated = false;
    while (pages < MAX_LIST_PAGES && roleHits.length < MAX_MATCHES_PER_TYPE) {
      const resp = await client.send(
        new ListRolesCommand({ Marker: marker, MaxItems: 100 }),
      );
      lastTruncated = !!resp.IsTruncated;
      for (const r of resp.Roles ?? []) {
        pushRole({
          type: 'role',
          name: r.RoleName ?? '',
          path: r.Path ?? '/',
          arn: r.Arn ?? '',
        });
      }
      if (!resp.IsTruncated) break;
      marker = resp.Marker;
      pages++;
      if (truncated) break;
    }
    if (pages >= MAX_LIST_PAGES && lastTruncated) truncated = true;
  }

  if (want.has('user')) {
    let marker: string | undefined;
    let pages = 0;
    let lastTruncated = false;
    while (pages < MAX_LIST_PAGES && userHits.length < MAX_MATCHES_PER_TYPE) {
      const out = await client.send(
        new ListUsersCommand({ Marker: marker, MaxItems: 100 }),
      );
      lastTruncated = !!out.IsTruncated;
      for (const u of out.Users ?? []) {
        pushUser({
          type: 'user',
          name: u.UserName ?? '',
          path: u.Path ?? '/',
          arn: u.Arn ?? '',
        });
      }
      if (!out.IsTruncated) break;
      marker = out.Marker;
      pages++;
      if (truncated) break;
    }
    if (pages >= MAX_LIST_PAGES && lastTruncated) truncated = true;
  }

  if (want.has('policy')) {
    const accountId = await getAccountId(region, profile);
    const q = query.trim();

    if (q.startsWith('arn:aws:iam::') && q.includes(':policy/')) {
      try {
        const gp = await client.send(new GetPolicyCommand({ PolicyArn: q }));
        const pol = gp.Policy;
        if (pol?.Arn && pol.PolicyName) {
          pushPolicy({
            type: 'policy',
            name: pol.PolicyName,
            path: pol.Path ?? '/',
            arn: pol.Arn,
          });
        }
      } catch (err) {
        if (!isNoSuchEntity(err)) throw err;
      }
    } else if (looksLikeSinglePolicyNameSegment(q)) {
      const rootArn = `arn:aws:iam::${accountId}:policy/${q}`;
      try {
        const gp = await client.send(
          new GetPolicyCommand({ PolicyArn: rootArn }),
        );
        const pol = gp.Policy;
        if (pol?.Arn && pol.PolicyName) {
          pushPolicy({
            type: 'policy',
            name: pol.PolicyName,
            path: pol.Path ?? '/',
            arn: pol.Arn,
          });
        }
      } catch (err) {
        if (!isNoSuchEntity(err)) throw err;
      }
    } else if (
      /^[\w/+=,.@-]+$/.test(q) &&
      q.includes('/') &&
      q.length <= 1024
    ) {
      const pathArn = `arn:aws:iam::${accountId}:policy/${q}`;
      try {
        const gp = await client.send(
          new GetPolicyCommand({ PolicyArn: pathArn }),
        );
        const pol = gp.Policy;
        if (pol?.Arn && pol.PolicyName) {
          pushPolicy({
            type: 'policy',
            name: pol.PolicyName,
            path: pol.Path ?? '/',
            arn: pol.Arn,
          });
        }
      } catch (err) {
        if (!isNoSuchEntity(err)) throw err;
      }
    }

    let marker: string | undefined;
    let pages = 0;
    let lastTruncated = false;
    while (
      pages < MAX_POLICY_LIST_PAGES &&
      policyHits.length < MAX_MATCHES_PER_TYPE
    ) {
      const out = await client.send(
        new ListPoliciesCommand({
          Marker: marker,
          MaxItems: 100,
          Scope: 'Local',
        }),
      );
      lastTruncated = !!out.IsTruncated;
      for (const p of out.Policies ?? []) {
        pushPolicy({
          type: 'policy',
          name: p.PolicyName ?? '',
          path: p.Path ?? '/',
          arn: p.Arn ?? '',
        });
      }
      if (!out.IsTruncated) break;
      marker = out.Marker;
      pages++;
      if (truncated) break;
    }
    if (pages >= MAX_POLICY_LIST_PAGES && lastTruncated) truncated = true;

    let rolesScanned = 0;
    let markerInline: string | undefined;
    let pagesInline = 0;
    let lastRoleInlineList: { IsTruncated?: boolean } | undefined;
    while (
      pagesInline < MAX_LIST_PAGES &&
      rolesScanned < MAX_INLINE_SCAN_ROLES &&
      policyHits.length < MAX_MATCHES_PER_TYPE
    ) {
      const resp = await client.send(
        new ListRolesCommand({ Marker: markerInline, MaxItems: 100 }),
      );
      lastRoleInlineList = resp;
      for (const r of resp.Roles ?? []) {
        if (
          rolesScanned >= MAX_INLINE_SCAN_ROLES ||
          policyHits.length >= MAX_MATCHES_PER_TYPE
        ) {
          truncated = true;
          break;
        }
        rolesScanned++;
        const roleName = r.RoleName ?? '';
        const inline = await client.send(
          new ListRolePoliciesCommand({ RoleName: roleName }),
        );
        for (const pn of inline.PolicyNames ?? []) {
          if (!pn) continue;
          pushPolicy({
            type: 'policy',
            name: pn,
            path: `(inline · role · ${roleName})`,
            arn: `inline:role:${roleName}:${pn}`,
            inlineParent: { kind: 'role', name: roleName },
          });
        }
      }
      if (!resp.IsTruncated) break;
      markerInline = resp.Marker;
      pagesInline++;
      if (truncated && policyHits.length >= MAX_MATCHES_PER_TYPE) break;
    }
    if (
      rolesScanned >= MAX_INLINE_SCAN_ROLES &&
      lastRoleInlineList?.IsTruncated
    ) {
      truncated = true;
    }

    let usersScanned = 0;
    let markerUserInline: string | undefined;
    let pagesUserInline = 0;
    let lastUserInlineList: { IsTruncated?: boolean } | undefined;
    while (
      pagesUserInline < MAX_LIST_PAGES &&
      usersScanned < MAX_INLINE_SCAN_USERS &&
      policyHits.length < MAX_MATCHES_PER_TYPE
    ) {
      const resp = await client.send(
        new ListUsersCommand({ Marker: markerUserInline, MaxItems: 100 }),
      );
      lastUserInlineList = resp;
      for (const u of resp.Users ?? []) {
        if (
          usersScanned >= MAX_INLINE_SCAN_USERS ||
          policyHits.length >= MAX_MATCHES_PER_TYPE
        ) {
          truncated = true;
          break;
        }
        usersScanned++;
        const userName = u.UserName ?? '';
        const inline = await client.send(
          new ListUserPoliciesCommand({ UserName: userName }),
        );
        for (const pn of inline.PolicyNames ?? []) {
          if (!pn) continue;
          pushPolicy({
            type: 'policy',
            name: pn,
            path: `(inline · user · ${userName})`,
            arn: `inline:user:${userName}:${pn}`,
            inlineParent: { kind: 'user', name: userName },
          });
        }
      }
      if (!resp.IsTruncated) break;
      markerUserInline = resp.Marker;
      pagesUserInline++;
      if (truncated && policyHits.length >= MAX_MATCHES_PER_TYPE) break;
    }
    if (
      usersScanned >= MAX_INLINE_SCAN_USERS &&
      lastUserInlineList?.IsTruncated
    ) {
      truncated = true;
    }
  }

  const results = [...roleHits, ...userHits, ...policyHits];
  const filtered = results.filter((h) =>
    matchesQuery(query, ...policyMatchParts(h)),
  );
  return {
    results: filtered.slice(0, MAX_MATCHES_PER_TYPE * 3),
    truncated,
  };
}

export interface IamExistsParams {
  entityType: IamEntityType;
  roleName?: string;
  userName?: string;
  groupName?: string;
  policyArn?: string;
  /** Inline policy copy creates a customer-managed policy named policyName on the target. */
  inlineSource?: IamInlinePolicySource;
}

export async function iamEntityExists(
  region: string,
  targetProfile: string | undefined,
  params: IamExistsParams,
): Promise<{ exists: boolean; detail?: string }> {
  const client = getIamClient(region, targetProfile);
  try {
    if (params.entityType === 'role' && params.roleName) {
      await client.send(new GetRoleCommand({ RoleName: params.roleName }));
      return { exists: true, detail: `Role ${params.roleName} is present` };
    }
    if (params.entityType === 'user' && params.userName) {
      await client.send(new GetUserCommand({ UserName: params.userName }));
      return { exists: true, detail: `User ${params.userName} is present` };
    }
    if (params.entityType === 'group' && params.groupName) {
      await client.send(new GetGroupCommand({ GroupName: params.groupName }));
      return { exists: true, detail: `Group ${params.groupName} is present` };
    }
    if (params.entityType === 'policy' && params.policyArn) {
      await client.send(new GetPolicyCommand({ PolicyArn: params.policyArn }));
      return { exists: true, detail: 'Policy is present in target account' };
    }
    if (params.entityType === 'policy' && params.inlineSource) {
      const tid = await getAccountId(region, targetProfile);
      const policyArn = `arn:aws:iam::${tid}:policy/${params.inlineSource.policyName}`;
      await client.send(new GetPolicyCommand({ PolicyArn: policyArn }));
      return {
        exists: true,
        detail: `Customer-managed policy ${params.inlineSource.policyName} exists in target account`,
      };
    }
    return { exists: false };
  } catch (err) {
    if (isNoSuchEntity(err)) return { exists: false };
    throw err;
  }
}

async function clearRoleAttachments(
  client: IAMClient,
  roleName: string,
): Promise<void> {
  const attached = await client.send(
    new ListAttachedRolePoliciesCommand({ RoleName: roleName }),
  );
  for (const ap of attached.AttachedPolicies ?? []) {
    await client.send(
      new DetachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: ap.PolicyArn!,
      }),
    );
  }
  const inline = await client.send(
    new ListRolePoliciesCommand({ RoleName: roleName }),
  );
  for (const pn of inline.PolicyNames ?? []) {
    await client.send(
      new DeleteRolePolicyCommand({ RoleName: roleName, PolicyName: pn! }),
    );
  }
}

async function clearUserAttachments(
  client: IAMClient,
  userName: string,
): Promise<void> {
  const attached = await client.send(
    new ListAttachedUserPoliciesCommand({ UserName: userName }),
  );
  for (const ap of attached.AttachedPolicies ?? []) {
    await client.send(
      new DetachUserPolicyCommand({
        UserName: userName,
        PolicyArn: ap.PolicyArn!,
      }),
    );
  }
  const inline = await client.send(
    new ListUserPoliciesCommand({ UserName: userName }),
  );
  for (const pn of inline.PolicyNames ?? []) {
    await client.send(
      new DeleteUserPolicyCommand({ UserName: userName, PolicyName: pn! }),
    );
  }
}

async function clearGroupAttachments(
  client: IAMClient,
  groupName: string,
): Promise<void> {
  const attached = await client.send(
    new ListAttachedGroupPoliciesCommand({ GroupName: groupName }),
  );
  for (const ap of attached.AttachedPolicies ?? []) {
    await client.send(
      new DetachGroupPolicyCommand({
        GroupName: groupName,
        PolicyArn: ap.PolicyArn!,
      }),
    );
  }
  const inline = await client.send(
    new ListGroupPoliciesCommand({ GroupName: groupName }),
  );
  for (const pn of inline.PolicyNames ?? []) {
    await client.send(
      new DeleteGroupPolicyCommand({ GroupName: groupName, PolicyName: pn! }),
    );
  }
}

async function upsertCustomerManagedPolicy(
  region: string,
  sourceProfile: string | undefined,
  targetProfile: string | undefined,
  sourcePolicyArn: string,
  sourceAccountId: string,
  targetAccountId: string,
  overwriteNested: boolean,
): Promise<string> {
  const src = getIamClient(region, sourceProfile);
  const tgt = getIamClient(region, targetProfile);
  const pol = await src.send(new GetPolicyCommand({ PolicyArn: sourcePolicyArn }));
  const p = pol.Policy;
  if (!p?.PolicyName || !p.Arn) throw new Error('Invalid source policy');
  const ver = await src.send(
    new GetPolicyVersionCommand({
      PolicyArn: sourcePolicyArn,
      VersionId: p.DefaultVersionId!,
    }),
  );
  const doc = decodePolicyDocument(ver.PolicyVersion?.Document);
  const targetArn = buildTargetPolicyArn(p.Arn, targetAccountId);

  try {
    await tgt.send(new GetPolicyCommand({ PolicyArn: targetArn }));
    if (overwriteNested) {
      await tgt.send(
        new CreatePolicyVersionCommand({
          PolicyArn: targetArn,
          PolicyDocument: doc,
          SetAsDefault: true,
        }),
      );
    }
    return targetArn;
  } catch (err) {
    if (isNoSuchEntity(err)) {
      const created = await tgt.send(
        new CreatePolicyCommand({
          PolicyName: p.PolicyName,
          Path: p.Path,
          PolicyDocument: doc,
          Description: p.Description,
        }),
      );
      return created.Policy?.Arn ?? targetArn;
    }
    throw err;
  }
}

export async function copyIamPolicy(
  region: string,
  sourceProfile: string | undefined,
  targetProfile: string | undefined,
  sourcePolicyArn: string,
  overwrite: boolean,
  deepCopy = false,
): Promise<{ policyArn: string }> {
  const sourceAccountId = await getAccountId(region, sourceProfile);
  const targetAccountId = await getAccountId(region, targetProfile);
  const targetArn = buildTargetPolicyArn(sourcePolicyArn, targetAccountId);
  const exists = await iamEntityExists(region, targetProfile, {
    entityType: 'policy',
    policyArn: targetArn,
  });
  if (exists.exists && !overwrite) {
    throw new Error(
      'Policy already exists in the target account. Enable overwrite to replace its default version.',
    );
  }
  const arn = await upsertCustomerManagedPolicy(
    region,
    sourceProfile,
    targetProfile,
    sourcePolicyArn,
    sourceAccountId,
    targetAccountId,
    overwrite,
  );
  if (deepCopy) {
    await copyManagedPolicyDependents(
      region,
      sourceProfile,
      targetProfile,
      sourcePolicyArn,
      targetArn,
    );
  }
  return { policyArn: arn };
}

/** Copy a customer inline policy to a new customer-managed policy on the target (root path, same policy name). */
export async function copyInlinePolicyAsManaged(
  region: string,
  sourceProfile: string | undefined,
  targetProfile: string | undefined,
  source: IamInlinePolicySource,
  overwrite: boolean,
  _deepCopy = false,
): Promise<{ policyArn: string }> {
  const sourceAccountId = await getAccountId(region, sourceProfile);
  const targetAccountId = await getAccountId(region, targetProfile);
  const src = getIamClient(region, sourceProfile);
  const tgt = getIamClient(region, targetProfile);

  let docRaw: string | undefined;
  if (source.kind === 'role') {
    const out = await src.send(
      new GetRolePolicyCommand({
        RoleName: source.parentName,
        PolicyName: source.policyName,
      }),
    );
    docRaw = out.PolicyDocument;
  } else {
    const out = await src.send(
      new GetUserPolicyCommand({
        UserName: source.parentName,
        PolicyName: source.policyName,
      }),
    );
    docRaw = out.PolicyDocument;
  }

  const doc = decodePolicyDocument(docRaw);
  const rewritten = rewriteAccountIdsInPolicyDocument(
    doc,
    sourceAccountId,
    targetAccountId,
  );

  const targetArn = `arn:aws:iam::${targetAccountId}:policy/${source.policyName}`;

  const exists = await iamEntityExists(region, targetProfile, {
    entityType: 'policy',
    policyArn: targetArn,
  });

  if (exists.exists && !overwrite) {
    throw new Error(
      'A customer-managed policy with this name already exists in the target account. Enable overwrite to replace its default version.',
    );
  }

  if (exists.exists && overwrite) {
    await tgt.send(
      new CreatePolicyVersionCommand({
        PolicyArn: targetArn,
        PolicyDocument: rewritten,
        SetAsDefault: true,
      }),
    );
    return { policyArn: targetArn };
  }

  await tgt.send(
    new CreatePolicyCommand({
      PolicyName: source.policyName,
      Path: '/',
      PolicyDocument: rewritten,
    }),
  );
  return { policyArn: targetArn };
}

export async function copyIamRole(
  region: string,
  sourceProfile: string | undefined,
  targetProfile: string | undefined,
  roleName: string,
  overwrite: boolean,
  deepCopy = false,
): Promise<{ roleArn: string }> {
  const sourceAccountId = await getAccountId(region, sourceProfile);
  const targetAccountId = await getAccountId(region, targetProfile);
  const src = getIamClient(region, sourceProfile);
  const tgt = getIamClient(region, targetProfile);

  const role = await src.send(new GetRoleCommand({ RoleName: roleName }));
  const r = role.Role;
  if (!r?.RoleName || !r.AssumeRolePolicyDocument) {
    throw new Error('Could not load source role');
  }
  const trustRaw = decodePolicyDocument(r.AssumeRolePolicyDocument);
  const trust = rewriteAccountIdsInPolicyDocument(
    trustRaw,
    sourceAccountId,
    targetAccountId,
  );

  const exists = await iamEntityExists(region, targetProfile, {
    entityType: 'role',
    roleName,
  });

  if (exists.exists && !overwrite) {
    throw new Error(
      'Role already exists in the target account. Enable overwrite to replace it.',
    );
  }

  if (!exists.exists) {
    await tgt.send(
      new CreateRoleCommand({
        RoleName: r.RoleName,
        Path: r.Path,
        AssumeRolePolicyDocument: trust,
        Description: r.Description,
        MaxSessionDuration: r.MaxSessionDuration,
      }),
    );
  } else {
    await clearRoleAttachments(tgt, roleName);
    await tgt.send(
      new UpdateAssumeRolePolicyCommand({
        RoleName: roleName,
        PolicyDocument: trust,
      }),
    );
  }

  const attached = await src.send(
    new ListAttachedRolePoliciesCommand({ RoleName: roleName }),
  );
  for (const ap of attached.AttachedPolicies ?? []) {
    const arn = ap.PolicyArn ?? '';
    if (arn.includes(':policy/AWS') || arn.startsWith('arn:aws:iam::aws:')) {
      await tgt.send(
        new AttachRolePolicyCommand({ RoleName: roleName, PolicyArn: arn }),
      );
    } else {
      const targetPolArn = await upsertCustomerManagedPolicy(
        region,
        sourceProfile,
        targetProfile,
        arn,
        sourceAccountId,
        targetAccountId,
        overwrite,
      );
      await tgt.send(
        new AttachRolePolicyCommand({
          RoleName: roleName,
          PolicyArn: targetPolArn,
        }),
      );
    }
  }

  const inline = await src.send(
    new ListRolePoliciesCommand({ RoleName: roleName }),
  );
  for (const pn of inline.PolicyNames ?? []) {
    const docResp = await src.send(
      new GetRolePolicyCommand({ RoleName: roleName, PolicyName: pn! }),
    );
    const inlineDoc = decodePolicyDocument(docResp.PolicyDocument);
    const rewritten = rewriteAccountIdsInPolicyDocument(
      inlineDoc,
      sourceAccountId,
      targetAccountId,
    );
    await tgt.send(
      new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: pn!,
        PolicyDocument: rewritten,
      }),
    );
  }

  if (deepCopy) {
    const tagList = await src.send(
      new ListRoleTagsCommand({ RoleName: roleName }),
    );
    if (tagList.Tags?.length) {
      await tgt.send(
        new TagRoleCommand({ RoleName: roleName, Tags: tagList.Tags }),
      );
    }

    const boundaryArn = r.PermissionsBoundary?.PermissionsBoundaryArn;
    if (boundaryArn) {
      if (boundaryArn.startsWith('arn:aws:iam::aws:')) {
        await tgt.send(
          new PutRolePermissionsBoundaryCommand({
            RoleName: roleName,
            PermissionsBoundary: boundaryArn,
          }),
        );
      } else {
        const targetB = buildTargetPolicyArn(boundaryArn, targetAccountId);
        await upsertCustomerManagedPolicy(
          region,
          sourceProfile,
          targetProfile,
          boundaryArn,
          sourceAccountId,
          targetAccountId,
          overwrite,
        );
        await tgt.send(
          new PutRolePermissionsBoundaryCommand({
            RoleName: roleName,
            PermissionsBoundary: targetB,
          }),
        );
      }
    }

    let ipMarker: string | undefined;
    do {
      const ips = await src.send(
        new ListInstanceProfilesForRoleCommand({
          RoleName: roleName,
          Marker: ipMarker,
        }),
      );
      for (const ip of ips.InstanceProfiles ?? []) {
        const ipName = ip.InstanceProfileName;
        if (!ipName) continue;
        try {
          await tgt.send(
            new GetInstanceProfileCommand({ InstanceProfileName: ipName }),
          );
        } catch (err) {
          if (isNoSuchEntity(err)) {
            const full = await src.send(
              new GetInstanceProfileCommand({ InstanceProfileName: ipName }),
            );
            const path = full.InstanceProfile?.Path ?? '/';
            await tgt.send(
              new CreateInstanceProfileCommand({
                InstanceProfileName: ipName,
                Path: path,
              }),
            );
          } else {
            throw err;
          }
        }
        try {
          await tgt.send(
            new AddRoleToInstanceProfileCommand({
              InstanceProfileName: ipName,
              RoleName: roleName,
            }),
          );
        } catch (err) {
          const name = (err as { name?: string }).name;
          if (name === 'EntityAlreadyExistsException') continue;
          throw err;
        }
      }
      if (!ips.IsTruncated) break;
      ipMarker = ips.Marker;
    } while (ipMarker);
  }

  const out = await tgt.send(new GetRoleCommand({ RoleName: roleName }));
  return { roleArn: out.Role?.Arn ?? '' };
}

export async function copyIamUser(
  region: string,
  sourceProfile: string | undefined,
  targetProfile: string | undefined,
  userName: string,
  overwrite: boolean,
  deepCopy = false,
): Promise<{ userArn: string }> {
  const sourceAccountId = await getAccountId(region, sourceProfile);
  const targetAccountId = await getAccountId(region, targetProfile);
  const src = getIamClient(region, sourceProfile);
  const tgt = getIamClient(region, targetProfile);

  const user = await src.send(new GetUserCommand({ UserName: userName }));
  const u = user.User;
  if (!u?.UserName) throw new Error('Could not load source user');

  const exists = await iamEntityExists(region, targetProfile, {
    entityType: 'user',
    userName,
  });

  if (exists.exists && !overwrite) {
    throw new Error(
      'User already exists in the target account. Enable overwrite to sync policies (passwords and keys are not copied).',
    );
  }

  if (!exists.exists) {
    const boundaryArn = u.PermissionsBoundary?.PermissionsBoundaryArn;
    await tgt.send(
      new CreateUserCommand({
        UserName: u.UserName,
        Path: u.Path,
        PermissionsBoundary: boundaryArn
          ? buildTargetPolicyArn(boundaryArn, targetAccountId)
          : undefined,
      }),
    );
  } else {
    await clearUserAttachments(tgt, userName);
  }

  const attached = await src.send(
    new ListAttachedUserPoliciesCommand({ UserName: userName }),
  );
  for (const ap of attached.AttachedPolicies ?? []) {
    const arn = ap.PolicyArn ?? '';
    if (arn.includes(':policy/AWS') || arn.startsWith('arn:aws:iam::aws:')) {
      await tgt.send(
        new AttachUserPolicyCommand({ UserName: userName, PolicyArn: arn }),
      );
    } else {
      const targetPolArn = await upsertCustomerManagedPolicy(
        region,
        sourceProfile,
        targetProfile,
        arn,
        sourceAccountId,
        targetAccountId,
        overwrite,
      );
      await tgt.send(
        new AttachUserPolicyCommand({
          UserName: userName,
          PolicyArn: targetPolArn,
        }),
      );
    }
  }

  const inline = await src.send(
    new ListUserPoliciesCommand({ UserName: userName }),
  );
  for (const pn of inline.PolicyNames ?? []) {
    const docResp = await src.send(
      new GetUserPolicyCommand({ UserName: userName, PolicyName: pn! }),
    );
    const inlineDoc = decodePolicyDocument(docResp.PolicyDocument);
    const rewritten = rewriteAccountIdsInPolicyDocument(
      inlineDoc,
      sourceAccountId,
      targetAccountId,
    );
    await tgt.send(
      new PutUserPolicyCommand({
        UserName: userName,
        PolicyName: pn!,
        PolicyDocument: rewritten,
      }),
    );
  }

  if (deepCopy) {
    const groupsForUser = await src.send(
      new ListGroupsForUserCommand({ UserName: userName }),
    );
    for (const g of groupsForUser.Groups ?? []) {
      const gn = g.GroupName ?? '';
      if (!gn) continue;
      const ge = await iamEntityExists(region, targetProfile, {
        entityType: 'group',
        groupName: gn,
      });
      if (!ge.exists) {
        await copyIamGroup(region, sourceProfile, targetProfile, gn, false);
      } else if (overwrite) {
        await copyIamGroup(region, sourceProfile, targetProfile, gn, true);
      }
      await tgt.send(
        new AddUserToGroupCommand({ UserName: userName, GroupName: gn }),
      );
    }
  }

  const out = await tgt.send(new GetUserCommand({ UserName: userName }));
  return { userArn: out.User?.Arn ?? '' };
}

export async function copyIamGroup(
  region: string,
  sourceProfile: string | undefined,
  targetProfile: string | undefined,
  groupName: string,
  overwrite: boolean,
): Promise<{ groupArn: string }> {
  const sourceAccountId = await getAccountId(region, sourceProfile);
  const targetAccountId = await getAccountId(region, targetProfile);
  const src = getIamClient(region, sourceProfile);
  const tgt = getIamClient(region, targetProfile);

  const g = await src.send(new GetGroupCommand({ GroupName: groupName }));
  const grp = g.Group;
  if (!grp?.GroupName) throw new Error('Could not load source group');

  const exists = await iamEntityExists(region, targetProfile, {
    entityType: 'group',
    groupName,
  });

  if (exists.exists && !overwrite) {
    const existing = await tgt.send(new GetGroupCommand({ GroupName: groupName }));
    return { groupArn: existing.Group?.Arn ?? '' };
  }

  if (!exists.exists) {
    await tgt.send(
      new CreateGroupCommand({
        GroupName: grp.GroupName,
        Path: grp.Path,
      }),
    );
  } else {
    await clearGroupAttachments(tgt, groupName);
  }

  const gAttached = await src.send(
    new ListAttachedGroupPoliciesCommand({ GroupName: groupName }),
  );
  for (const ap of gAttached.AttachedPolicies ?? []) {
    const arn = ap.PolicyArn ?? '';
    if (arn.includes(':policy/AWS') || arn.startsWith('arn:aws:iam::aws:')) {
      await tgt.send(
        new AttachGroupPolicyCommand({ GroupName: groupName, PolicyArn: arn }),
      );
    } else {
      const targetPolArn = await upsertCustomerManagedPolicy(
        region,
        sourceProfile,
        targetProfile,
        arn,
        sourceAccountId,
        targetAccountId,
        overwrite,
      );
      await tgt.send(
        new AttachGroupPolicyCommand({
          GroupName: groupName,
          PolicyArn: targetPolArn,
        }),
      );
    }
  }

  const gInline = await src.send(
    new ListGroupPoliciesCommand({ GroupName: groupName }),
  );
  for (const pn of gInline.PolicyNames ?? []) {
    const docResp = await src.send(
      new GetGroupPolicyCommand({ GroupName: groupName, PolicyName: pn! }),
    );
    const inlineDoc = decodePolicyDocument(docResp.PolicyDocument);
    const rewrittenG = rewriteAccountIdsInPolicyDocument(
      inlineDoc,
      sourceAccountId,
      targetAccountId,
    );
    await tgt.send(
      new PutGroupPolicyCommand({
        GroupName: groupName,
        PolicyName: pn!,
        PolicyDocument: rewrittenG,
      }),
    );
  }

  const gOut = await tgt.send(new GetGroupCommand({ GroupName: groupName }));
  return { groupArn: gOut.Group?.Arn ?? '' };
}

async function copyManagedPolicyDependents(
  region: string,
  sourceProfile: string | undefined,
  targetProfile: string | undefined,
  sourcePolicyArn: string,
  targetPolicyArn: string,
): Promise<void> {
  const src = getIamClient(region, sourceProfile);
  const tgt = getIamClient(region, targetProfile);
  let marker: string | undefined;
  let total = 0;
  do {
    const entities = await src.send(
      new ListEntitiesForPolicyCommand({
        PolicyArn: sourcePolicyArn,
        Marker: marker,
        MaxItems: 100,
      }),
    );
    for (const pr of entities.PolicyRoles ?? []) {
      if (total >= MAX_DEEP_POLICY_PRINCIPALS) return;
      const rn = pr.RoleName;
      if (!rn) continue;
      const re = await iamEntityExists(region, targetProfile, {
        entityType: 'role',
        roleName: rn,
      });
      if (re.exists) {
        await tgt.send(
          new AttachRolePolicyCommand({
            RoleName: rn,
            PolicyArn: targetPolicyArn,
          }),
        );
      } else {
        await copyIamRole(region, sourceProfile, targetProfile, rn, false, false);
      }
      total++;
    }
    for (const pu of entities.PolicyUsers ?? []) {
      if (total >= MAX_DEEP_POLICY_PRINCIPALS) return;
      const un = pu.UserName;
      if (!un) continue;
      const ue = await iamEntityExists(region, targetProfile, {
        entityType: 'user',
        userName: un,
      });
      if (ue.exists) {
        await tgt.send(
          new AttachUserPolicyCommand({
            UserName: un,
            PolicyArn: targetPolicyArn,
          }),
        );
      } else {
        await copyIamUser(region, sourceProfile, targetProfile, un, false, false);
      }
      total++;
    }
    for (const pg of entities.PolicyGroups ?? []) {
      if (total >= MAX_DEEP_POLICY_PRINCIPALS) return;
      const gn = pg.GroupName;
      if (!gn) continue;
      const ge = await iamEntityExists(region, targetProfile, {
        entityType: 'group',
        groupName: gn,
      });
      if (ge.exists) {
        await tgt.send(
          new AttachGroupPolicyCommand({
            GroupName: gn,
            PolicyArn: targetPolicyArn,
          }),
        );
      } else {
        await copyIamGroup(region, sourceProfile, targetProfile, gn, false);
      }
      total++;
    }
    if (!entities.IsTruncated) break;
    marker = entities.Marker;
  } while (marker);
}

export async function listIamUserNames(
  region: string,
  profile?: string,
): Promise<ListIamUsersResult> {
  const client = getIamClient(region, profile);
  const users: string[] = [];
  let marker: string | undefined;
  let pages = 0;
  let truncated = false;

  while (pages < MAX_LIST_PAGES) {
    const resp = await client.send(
      new ListUsersCommand({ Marker: marker, MaxItems: 100 }),
    );
    for (const u of resp.Users ?? []) {
      const name = u.UserName;
      if (name) users.push(name);
    }
    if (!resp.IsTruncated) break;
    marker = resp.Marker;
    pages++;
    if (pages >= MAX_LIST_PAGES) truncated = true;
  }

  return {
    users: users.sort(),
    truncated,
  };
}

async function getAccountPasswordPolicy(
  client: IAMClient,
): Promise<PasswordPolicy | undefined> {
  try {
    const resp = await client.send(new GetAccountPasswordPolicyCommand({}));
    return resp.PasswordPolicy;
  } catch (err) {
    if (isNoSuchEntity(err)) {
      return {
        MinimumPasswordLength: 12,
        RequireSymbols: true,
        RequireNumbers: true,
        RequireUppercaseCharacters: true,
        RequireLowercaseCharacters: true,
      } as PasswordPolicy;
    }
    throw err;
  }
}

function generateStrongPassword(length = 16): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const all = upper + lower + numbers + symbols;

  let password = '';
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  for (let i = 4; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

async function copyIamUserPermissionsSameAccount(
  srcClient: IAMClient,
  tgtClient: IAMClient,
  templateUserName: string,
  targetUserName: string,
  includeGroups = false,
): Promise<void> {
  const attached = await srcClient.send(
    new ListAttachedUserPoliciesCommand({ UserName: templateUserName }),
  );
  for (const ap of attached.AttachedPolicies ?? []) {
    const arn = ap.PolicyArn ?? '';
    await tgtClient.send(
      new AttachUserPolicyCommand({ UserName: targetUserName, PolicyArn: arn }),
    );
  }

  const inline = await srcClient.send(
    new ListUserPoliciesCommand({ UserName: templateUserName }),
  );
  for (const pn of inline.PolicyNames ?? []) {
    const docResp = await srcClient.send(
      new GetUserPolicyCommand({ UserName: templateUserName, PolicyName: pn! }),
    );
    const inlineDoc = decodePolicyDocument(docResp.PolicyDocument);
    await tgtClient.send(
      new PutUserPolicyCommand({
        UserName: targetUserName,
        PolicyName: pn!,
        PolicyDocument: inlineDoc,
      }),
    );
  }

  if (includeGroups) {
    const groups = await srcClient.send(
      new ListGroupsForUserCommand({ UserName: templateUserName }),
    );
    for (const g of groups.Groups ?? []) {
      const gn = g.GroupName ?? '';
      if (!gn) continue;
      await tgtClient.send(
        new AddUserToGroupCommand({ UserName: targetUserName, GroupName: gn }),
      );
    }
  }
}

export async function getIamSignInUrl(
  region: string,
  profile?: string,
): Promise<string> {
  const accountId = await getAccountId(region, profile);
  const client = getIamClient(region, profile);

  try {
    const resp = await client.send(new ListAccountAliasesCommand({}));
    const alias = resp.AccountAliases?.[0];
    const identifier = alias || accountId;
    return `https://${identifier}.signin.aws.amazon.com/console/`;
  } catch {
    return `https://${accountId}.signin.aws.amazon.com/console/`;
  }
}

async function cleanupUser(
  client: IAMClient,
  userName: string,
  hadLoginProfile = false,
  hadAccessKey?: { id: string; created: boolean },
): Promise<void> {
  try {
    if (hadAccessKey?.created && hadAccessKey.id) {
      await client.send(
        new DeleteAccessKeyCommand({
          UserName: userName,
          AccessKeyId: hadAccessKey.id,
        }),
      );
    }
  } catch {}

  try {
    if (hadLoginProfile) {
      await client.send(
        new DeleteLoginProfileCommand({ UserName: userName }),
      );
    }
  } catch {}

  try {
    await clearUserAttachments(client, userName);
  } catch {}

  try {
    const groups = await client.send(
      new ListGroupsForUserCommand({ UserName: userName }),
    );
    for (const g of groups.Groups ?? []) {
      const gn = g.GroupName ?? '';
      if (gn) {
        await client.send(
          new RemoveUserFromGroupCommand({
            UserName: userName,
            GroupName: gn,
          }),
        );
      }
    }
  } catch {}

  try {
    await client.send(
      new DeleteUserPermissionsBoundaryCommand({ UserName: userName }),
    );
  } catch {}

  try {
    await client.send(new DeleteUserCommand({ UserName: userName }));
  } catch {}
}

export async function provisionIamUserWithConsoleAndKey(
  region: string,
  profile: string | undefined,
  newUserName: string,
  templateUserName: string,
  options: { includeGroups?: boolean } = {},
): Promise<ProvisionedIamUser> {
  if (newUserName === templateUserName) {
    throw new Error('New username cannot be the same as template user');
  }

  const client = getIamClient(region, profile);
  const templateUser = await client.send(
    new GetUserCommand({ UserName: templateUserName }),
  );
  const template = templateUser.User;
  if (!template?.UserName) {
    throw new Error(`Template user ${templateUserName} not found`);
  }

  const exists = await iamEntityExists(region, profile, {
    entityType: 'user',
    userName: newUserName,
  });
  if (exists.exists) {
    throw new Error(`User ${newUserName} already exists`);
  }

  const srcClient = client; // same account
  const tgtClient = client;

  let createdUser = false;
  let hadLoginProfile = false;
  let accessKeyId = '';
  let hadAccessKey = false;

  try {
    const path = template.Path ?? '/';
    const boundary = template.PermissionsBoundary?.PermissionsBoundaryArn;

    await tgtClient.send(
      new CreateUserCommand({
        UserName: newUserName,
        Path: path,
        PermissionsBoundary: boundary,
      }),
    );
    createdUser = true;

    await copyIamUserPermissionsSameAccount(
      srcClient,
      tgtClient,
      templateUserName,
      newUserName,
      options.includeGroups ?? false,
    );

    const policy = await getAccountPasswordPolicy(client);
    let password = generateStrongPassword(16);

    let loginProfileCreated = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      try {
        await tgtClient.send(
          new CreateLoginProfileCommand({
            UserName: newUserName,
            Password: password,
            PasswordResetRequired: true,
          }),
        );
        loginProfileCreated = true;
        hadLoginProfile = true;
        break;
      } catch (err: unknown) {
        const errName =
          err && typeof err === 'object' && 'name' in err
            ? String((err as { name: unknown }).name)
            : '';
        if (
          errName === 'PasswordPolicyViolation' &&
          attempts < maxAttempts - 1
        ) {
          attempts++;
          password = generateStrongPassword(20);
          continue;
        }
        throw err;
      }
    }
    if (!loginProfileCreated) {
      throw new Error('Failed to create login profile after multiple attempts');
    }

    const keyResp = await tgtClient.send(
      new CreateAccessKeyCommand({ UserName: newUserName }),
    );
    const key = keyResp.AccessKey;
    accessKeyId = key?.AccessKeyId ?? '';
    hadAccessKey = true;

    const signInUrl = await getIamSignInUrl(region, profile);

    return {
      signInUrl,
      username: newUserName,
      password,
      accessKeyId,
      secretAccessKey: key?.SecretAccessKey ?? '',
      userArn: template.Arn?.replace(templateUserName, newUserName),
    };
  } catch (err) {
    if (createdUser) {
      await cleanupUser(
        client,
        newUserName,
        hadLoginProfile,
        hadAccessKey ? { id: accessKeyId, created: true } : undefined,
      );
    }
    throw err;
  }
}
