import { NextRequest, NextResponse } from "next/server";
import { getRunLogsUrl } from "@/lib/github/actions";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await params;
    const { searchParams } = req.nextUrl;
    const repoFullName = searchParams.get("repo");

    if (!repoFullName) {
      return NextResponse.json({ error: "Missing repo parameter" }, { status: 400 });
    }

    const id = Number(runId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid runId" }, { status: 400 });
    }

    const logsUrl = await getRunLogsUrl(repoFullName, id);
    return NextResponse.json({ url: logsUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get logs URL" },
      { status: 500 },
    );
  }
}
