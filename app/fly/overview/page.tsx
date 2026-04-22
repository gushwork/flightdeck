import { listApps, getAppsStatus } from "@/lib/fly/cli";
import type { EnrichedFlyApp } from "@/lib/fly/types";
import { FlyOverviewClient } from "./fly-overview-client";

/** Per-user flyctl data; avoid static generation at build time when CLI is absent. */
export const dynamic = "force-dynamic";

export default async function FlyOverviewPage() {
  let initialApps: EnrichedFlyApp[] = [];
  let initialError: string | null = null;
  try {
    const apps = await listApps();
    const statuses = await getAppsStatus(apps.map((a) => a.name));
    const statusMap = Object.fromEntries(statuses.map((s) => [s.appName, s]));
    initialApps = apps.map((a) => ({ ...a, status_detail: statusMap[a.name] ?? null }));
  } catch (err) {
    initialError = err instanceof Error ? err.message : String(err);
  }

  return <FlyOverviewClient initialApps={initialApps} initialError={initialError} />;
}
