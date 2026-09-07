import { NextResponse } from "next/server";
import { parseProfileParam } from "@/lib/aws/client";
import { applyPreview } from "@/lib/domains/fly-route53";
import type { FlyDomainApplyRequest } from "@/lib/domains/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as FlyDomainApplyRequest;
    const result = await applyPreview({
      ...body,
      profile: parseProfileParam(body.profile),
    });
    return NextResponse.json({ result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status =
      (err as Error & { status?: number }).status ??
      (msg.includes("hash mismatch") ? 409 : 500);
    return NextResponse.json({ error: msg }, { status });
  }
}
