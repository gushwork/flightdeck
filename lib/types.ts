import type { SecretValueMatch } from '@/lib/secret-value-search';
import type { SecretReplaceChange } from '@/lib/secret-replace';

/* ── Secrets ── */

export interface SecretEntry {
  name: string;
  arn: string;
  description?: string;
  createdDate: string;
  lastChangedDate?: string;
  lastAccessedDate?: string;
  tags: Record<string, string>;
  rotationEnabled: boolean;
  rotationLambdaArn?: string;
  rotationRules?: { automaticallyAfterDays?: number; scheduleExpression?: string };
  lastRotatedDate?: string;
  primaryRegion?: string;
  owningService?: string;
}

export interface SecretSearchResult {
  name: string;
  arn: string;
  environment: string;
  type: string;
  /** Every hit in this secret's value — one per matching JSON key/leaf, or one raw snippet. */
  matches: SecretValueMatch[];
}

/** `will-change` only from a dry run; `updated` only after the write is confirmed as AWSCURRENT. */
export type SecretReplaceStatus = 'will-change' | 'updated' | 'no-match' | 'failed';

export interface SecretReplaceResult {
  name: string;
  status: SecretReplaceStatus;
  changes: SecretReplaceChange[];
  versionId?: string;
  error?: string;
}

export interface SecretValue {
  name: string;
  arn: string;
  secretString?: string;
  secretBinary?: boolean;
  versionId?: string;
  versionStages?: string[];
}

/* ── Amplify Hosting (Console API) ── */

export interface AmplifyAppSummary {
  appId: string;
  name: string;
  defaultDomain?: string;
  productionBranchName?: string;
}

export interface AmplifyBranchEnv {
  branchName: string;
  environmentVariables: Record<string, string>;
}

export interface AmplifyAppSnapshot {
  appId: string;
  name: string;
  defaultDomain?: string;
  productionBranchName?: string;
  appEnvironmentVariables: Record<string, string>;
  branches: AmplifyBranchEnv[];
}

export interface AmplifySearchHit {
  appId: string;
  appName: string;
  scope: 'app' | 'branch';
  branchName?: string;
  key: string;
  value: string;
  matchedContext: string;
}
