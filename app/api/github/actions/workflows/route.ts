import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllWorkflowsFast,
  dispatchWorkflow,
  enableWorkflow,
  disableWorkflow,
} from "@/lib/github/actions";

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

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action: "dispatch" | "enable" | "disable";
      repoFullName: string;
      workflowId: number;
      ref?: string;
      inputs?: Record<string, string>;
    };

    const { action, repoFullName, workflowId } = body;

    if (!action || !repoFullName || !workflowId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    switch (action) {
      case "dispatch":
        if (!body.ref) {
          return NextResponse.json({ error: "ref is required for dispatch" }, { status: 400 });
        }
        await dispatchWorkflow(repoFullName, workflowId, body.ref, body.inputs ?? {});
        break;
      case "enable":
        await enableWorkflow(repoFullName, workflowId);
        break;
      case "disable":
        await disableWorkflow(repoFullName, workflowId);
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 },
    );
  }
}
