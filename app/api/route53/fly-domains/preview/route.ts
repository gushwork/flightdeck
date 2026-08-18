import { NextResponse } from "next/server";
import { parseProfileParam } from "@/lib/aws/client";
import { buildApplyPreview } from "@/lib/domains/fly-route53";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const preview = await buildApplyPreview({
      appName: body.appName,
      hostname: body.hostname,
      region: body.region,
      profile: parseProfileParam(body.profile),
      hostedZoneId: body.hostedZoneId,
    });
    return NextResponse.json({ preview });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("No hosted zone") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
