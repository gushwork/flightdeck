import { NextResponse } from "next/server";
import { getRegion, parseProfileParam } from "@/lib/aws/client";
import { listHostedZones } from "@/lib/aws/route53";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const region = getRegion(url.searchParams.get("region") ?? undefined);
    const profile = parseProfileParam(url.searchParams.get("profile"));
    const zones = await listHostedZones(region, profile);
    return NextResponse.json({ zones });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
