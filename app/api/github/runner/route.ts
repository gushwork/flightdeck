import { NextResponse } from "next/server";
import { getRunnerSnapshot } from "@/lib/runner/ssh";

export const dynamic = "force-dynamic";

/** Live status + job history of the self-hosted runner on the Azure VM (read over SSH). */
export async function GET() {
  try {
    return NextResponse.json({ snapshot: await getRunnerSnapshot() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
