/** Fly.io application as returned by `fly apps list -j` (fields we use). */
export interface FlyApp {
  name: string;
  status: string;
  deployed: boolean;
  hostname: string;
  org: string;
  orgSlug: string;
  currentReleaseStatus: string;
  currentReleaseAt: string;
}

export type MachineCheckStatus = "passing" | "warning" | "critical" | "unknown";

export interface MachineCheck {
  name: string;
  status: MachineCheckStatus;
  output: string;
  updatedAt: string;
}

export interface FlyMachine {
  id: string;
  name: string;
  state: string;
  region: string;
  createdAt: string;
  updatedAt: string;
  checks: MachineCheck[];
  runtime: string;
}

/** Derived health for a single app (from `fly status -a <app> -j`). */
export interface FlyAppStatus {
  appName: string;
  hostname: string;
  deployed: boolean;
  machines: FlyMachine[];
  /** Worst-case health across all machines and checks. */
  health: "healthy" | "degraded" | "down" | "unknown";
}

export interface FlySecret {
  name: string;
  digest: string;
  status: string;
}

/** App list row with optional status from `getAppsStatus` (Fly overview). */
export type EnrichedFlyApp = FlyApp & { status_detail: FlyAppStatus | null };
