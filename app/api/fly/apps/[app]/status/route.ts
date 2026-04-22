import { NextResponse } from "next/server";
import { getAppStatus } from "@/lib/fly/cli";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ app: string }> },
) {
  const { app } = await params;
  try {
    const status = await getAppStatus(decodeURIComponent(app));
    return NextResponse.json(status);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
