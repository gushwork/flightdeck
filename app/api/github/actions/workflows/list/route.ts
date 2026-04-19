import { NextRequest, NextResponse } from "next/server";
import { fetchAllWorkflowsFast } from "@/lib/github/actions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const repoFilter = searchParams.get("repo");

    const allWorkflows = await fetchAllWorkflowsFast(30);
    const filtered = repoFilter
      ? allWorkflows.filter((w) => w.repoFullName === repoFilter)
      : allWorkflows;

    return NextResponse.json({ workflows: filtered });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list workflows" },
      { status: 500 },
    );
  }
}
