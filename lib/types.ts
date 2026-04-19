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
  matchedContext: string;
  matchedKey?: string;
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
