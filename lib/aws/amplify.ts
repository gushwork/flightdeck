import {
  AmplifyClient,
  GetAppCommand,
  ListAppsCommand,
  ListBranchesCommand,
  UpdateAppCommand,
  UpdateBranchCommand,
} from '@aws-sdk/client-amplify';
import { awsClientOptions } from '@/lib/aws/client';
import type {
  AmplifyAppSnapshot,
  AmplifyAppSummary,
  AmplifyBranchEnv,
  AmplifySearchHit,
} from '@/lib/types';

function getClient(region: string, profile?: string) {
  return new AmplifyClient(awsClientOptions(region, profile));
}

function normalizeEnv(
  env: Record<string, string> | undefined,
): Record<string, string> {
  if (!env) return {};
  return { ...env };
}

function appToSummary(app: {
  appId?: string;
  name?: string;
  defaultDomain?: string;
  productionBranch?: { branchName?: string };
}): AmplifyAppSummary {
  return {
    appId: app.appId ?? '',
    name: app.name ?? '',
    defaultDomain: app.defaultDomain,
    productionBranchName: app.productionBranch?.branchName,
  };
}

export async function listAppsPage(
  region: string,
  profile: string | undefined,
  nextToken?: string,
): Promise<{ apps: AmplifyAppSummary[]; nextToken?: string }> {
  const client = getClient(region, profile);
  const res = await client.send(
    new ListAppsCommand({
      maxResults: 50,
      nextToken,
    }),
  );
  const apps = (res.apps ?? []).map((a) => appToSummary(a));
  return { apps, nextToken: res.nextToken };
}

async function listAllBranches(
  region: string,
  appId: string,
  profile: string | undefined,
): Promise<AmplifyBranchEnv[]> {
  const client = getClient(region, profile);
  const branches: AmplifyBranchEnv[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListBranchesCommand({
        appId,
        maxResults: 50,
        nextToken: token,
      }),
    );
    for (const b of res.branches ?? []) {
      const branchName = b.branchName;
      if (!branchName) continue;
      branches.push({
        branchName,
        environmentVariables: normalizeEnv(b.environmentVariables),
      });
    }
    token = res.nextToken;
  } while (token);
  return branches;
}

export async function getAppSnapshot(
  region: string,
  appId: string,
  profile: string | undefined,
): Promise<AmplifyAppSnapshot> {
  const client = getClient(region, profile);
  const res = await client.send(new GetAppCommand({ appId }));
  const app = res.app;
  if (!app?.appId) {
    throw new Error('App not found');
  }
  const branches = await listAllBranches(region, appId, profile);
  return {
    appId: app.appId,
    name: app.name ?? '',
    defaultDomain: app.defaultDomain,
    productionBranchName: app.productionBranch?.branchName,
    appEnvironmentVariables: normalizeEnv(app.environmentVariables),
    branches,
  };
}

export async function updateAppEnvironmentVariables(
  region: string,
  appId: string,
  environmentVariables: Record<string, string>,
  profile: string | undefined,
): Promise<void> {
  const client = getClient(region, profile);
  await client.send(
    new UpdateAppCommand({
      appId,
      environmentVariables,
    }),
  );
}

export async function updateBranchEnvironmentVariables(
  region: string,
  appId: string,
  branchName: string,
  environmentVariables: Record<string, string>,
  profile: string | undefined,
): Promise<void> {
  const client = getClient(region, profile);
  await client.send(
    new UpdateBranchCommand({
      appId,
      branchName,
      environmentVariables,
    }),
  );
}

function snippetAround(value: string, query: string): string {
  const q = query.toLowerCase();
  const lower = value.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return value.slice(0, 120);
  const start = Math.max(0, idx - 40);
  const end = Math.min(value.length, idx + query.length + 40);
  return (start > 0 ? '…' : '') + value.slice(start, end) + (end < value.length ? '…' : '');
}

const SEARCH_MAX_HITS = 300;

export async function searchAmplifyEnvironmentVariables(
  region: string,
  profile: string | undefined,
  query: string,
): Promise<{
  hits: AmplifySearchHit[];
  appsScanned: number;
  branchRowsScanned: number;
  keyMatches: number;
}> {
  const q = query.trim().toLowerCase();
  if (!q) {
    return { hits: [], appsScanned: 0, branchRowsScanned: 0, keyMatches: 0 };
  }

  const client = getClient(region, profile);
  const summaries: AmplifyAppSummary[] = [];
  let listToken: string | undefined;
  do {
    const page = await client.send(
      new ListAppsCommand({ maxResults: 50, nextToken: listToken }),
    );
    for (const a of page.apps ?? []) {
      summaries.push(appToSummary(a));
    }
    listToken = page.nextToken;
  } while (listToken);

  const hits: AmplifySearchHit[] = [];
  let branchRowsScanned = 0;
  let keyMatches = 0;

  for (const sum of summaries) {
    if (hits.length >= SEARCH_MAX_HITS) break;
    const appId = sum.appId;
    if (!appId) continue;

    const res = await client.send(new GetAppCommand({ appId }));
    const app = res.app;
    const appName = app?.name ?? sum.name;

    const appEnv = normalizeEnv(app?.environmentVariables);
    for (const [key, value] of Object.entries(appEnv)) {
      if (hits.length >= SEARCH_MAX_HITS) break;
      const keyHit = key.toLowerCase().includes(q);
      const valHit = value.toLowerCase().includes(q);
      if (keyHit || valHit) {
        if (keyHit) keyMatches += 1;
        hits.push({
          appId,
          appName,
          scope: 'app',
          key,
          value,
          matchedContext: keyHit
            ? `${key}=${snippetAround(value, query)}`
            : `${key}=${snippetAround(value, query)}`,
        });
      }
    }

    let branchToken: string | undefined;
    do {
      const bRes = await client.send(
        new ListBranchesCommand({
          appId,
          maxResults: 50,
          nextToken: branchToken,
        }),
      );
      for (const b of bRes.branches ?? []) {
        if (hits.length >= SEARCH_MAX_HITS) break;
        const branchName = b.branchName;
        if (!branchName) continue;
        branchRowsScanned += 1;
        const env = normalizeEnv(b.environmentVariables);
        for (const [key, value] of Object.entries(env)) {
          if (hits.length >= SEARCH_MAX_HITS) break;
          const keyHit = key.toLowerCase().includes(q);
          const valHit = value.toLowerCase().includes(q);
          if (keyHit || valHit) {
            if (keyHit) keyMatches += 1;
            hits.push({
              appId,
              appName,
              scope: 'branch',
              branchName,
              key,
              value,
              matchedContext: `[${branchName}] ${key}=${snippetAround(value, query)}`,
            });
          }
        }
      }
      branchToken = bRes.nextToken;
    } while (branchToken && hits.length < SEARCH_MAX_HITS);
  }

  return {
    hits,
    appsScanned: summaries.length,
    branchRowsScanned,
    keyMatches,
  };
}
