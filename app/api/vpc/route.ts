import type { NextRequest } from "next/server";
import { getRegion, parseProfileParam } from "@/lib/aws/client";
import { listVpcs } from "@/lib/aws/vpc";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const region = getRegion(params.get("region") ?? undefined);
    return Response.json(await listVpcs(region, parseProfileParam(params.get("profile"))));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
