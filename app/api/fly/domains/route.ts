import { NextResponse } from "next/server";
import { getAppsDomainStatus, listApps } from "@/lib/fly/cli";

export const dynamic = "force-dynamic";

function flyAuthStatus(msg: string): number {
  return msg.includes("not authenticated") || msg.includes("auth login") ? 401 : 500;
}

export async function GET() {
  try {
    const apps = await listApps();
    const rows = await getAppsDomainStatus(apps);
    return NextResponse.json({ apps: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: flyAuthStatus(msg) });
  }
}
