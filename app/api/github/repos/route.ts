import { NextResponse } from "next/server";
import { listUserRepos } from "@/lib/github/actions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const repos = await listUserRepos();
    return NextResponse.json({ repos });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list repos" },
      { status: 500 },
    );
  }
}
