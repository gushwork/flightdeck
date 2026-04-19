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

    const logsUrl = await getRunLogsUrl(repoFullName, Number(runId));
    return NextResponse.json({ url: logsUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get logs URL" },
      { status: 500 },
    );
  }
}
