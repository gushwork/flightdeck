import { NextRequest, NextResponse } from "next/server";
import { getWorkflowDetail } from "@/lib/github/actions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const repo = searchParams.get("repo");
    const workflowId = searchParams.get("workflowId");

    if (!repo || !workflowId) {
      return NextResponse.json(
        { error: "Missing repo or workflowId parameter" },
        { status: 400 },
      );
    }

    const detail = await getWorkflowDetail(repo, Number(workflowId));
    return NextResponse.json(detail);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch workflow detail" },
      { status: 500 },
    );
  }
}
