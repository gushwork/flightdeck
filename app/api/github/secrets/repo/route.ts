import { NextRequest, NextResponse } from "next/server";
import { getRepoCockpit } from "@/lib/github/secrets-indexer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const fullName = req.nextUrl.searchParams.get("fullName");
    if (!fullName) {
      return NextResponse.json({ error: "fullName query parameter required" }, { status: 400 });
    }
    const cockpit = await getRepoCockpit(fullName);
    return NextResponse.json(cockpit);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load repo secrets" },
      { status: 500 },
    );
  }
}
