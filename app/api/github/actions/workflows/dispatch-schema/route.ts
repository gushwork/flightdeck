import { NextRequest, NextResponse } from "next/server";
import { githubFetch } from "@/lib/github/client";
import { getWorkflow, getWorkflowFileContent } from "@/lib/github/actions";
import { parseWorkflowDispatchFromYaml } from "@/lib/github/workflow-dispatch-schema";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const repo = req.nextUrl.searchParams.get("repo");
    const workflowIdParam = req.nextUrl.searchParams.get("workflowId");
    if (!repo || !workflowIdParam) {
      return NextResponse.json({ error: "repo and workflowId are required" }, { status: 400 });
    }
    const workflowId = Number(workflowIdParam);
    if (!Number.isFinite(workflowId)) {
      return NextResponse.json({ error: "invalid workflowId" }, { status: 400 });
    }

    let wfPath: string;
    try {
      const wf = await getWorkflow(repo, workflowId);
      wfPath = wf.path;
    } catch {
      return NextResponse.json({
        hasWorkflowDispatch: false,
        inputs: [],
        parseError: "Workflow not found",
      });
    }

    if (!wfPath) {
      return NextResponse.json({ hasWorkflowDispatch: false, inputs: [] });
    }

    const [repoMeta, file] = await Promise.all([
      githubFetch<{ default_branch: string }>(`/repos/${repo}`),
      getWorkflowFileContent(repo, wfPath),
    ]);

    const schema = parseWorkflowDispatchFromYaml(file.content || "");
    return NextResponse.json({
      ...schema,
      suggestedRef: repoMeta.default_branch,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load dispatch schema" },
      { status: 500 },
    );
  }
}
