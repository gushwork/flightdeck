import { NextResponse } from "next/server";
import { checkCert } from "@/lib/fly/cli";

export const dynamic = "force-dynamic";

function flyAuthStatus(msg: string): number {
  return msg.includes("not authenticated") || msg.includes("auth login") ? 401 : 500;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ app: string; hostname: string }> },
) {
  const { app, hostname } = await params;
  try {
    const cert = await checkCert(decodeURIComponent(app), decodeURIComponent(hostname));
    return NextResponse.json({ cert });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("Could not find") || msg.includes("not found") ? 404 : flyAuthStatus(msg);
    return NextResponse.json({ error: msg }, { status });
  }
}
