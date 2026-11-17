import { NextResponse } from "next/server";
import { getCosts } from "@/lib/costs/cli";

export const dynamic = "force-dynamic";

/** Month-to-date + last-month spend for AWS, Azure and GCP via the local CLIs. `?refresh=1` skips the 1h cache. */
export async function GET(req: Request) {
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  return NextResponse.json({ snapshot: await getCosts(refresh) });
}
