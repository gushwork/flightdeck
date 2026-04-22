import { NextResponse } from "next/server";
import { listApps, getAppsStatus } from "@/lib/fly/cli";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const withStatus = url.searchParams.get("status") === "1";

  try {
    const apps = await listApps();
    if (!withStatus) return NextResponse.json({ apps });

    const statuses = await getAppsStatus(apps.map((a) => a.name));
    const statusMap = Object.fromEntries(statuses.map((s) => [s.appName, s]));
    const enriched = apps.map((a) => ({ ...a, status_detail: statusMap[a.name] ?? null }));
    return NextResponse.json({ apps: enriched });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("not authenticated") || msg.includes("auth login") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
