import { NextRequest, NextResponse } from "next/server";
import {
  listUserRepos,
  listAllRuns,
  rerunWorkflowRun,
  rerunFailedJobs,
  cancelWorkflowRun,
} from "@/lib/github/actions";
import { invalidateMemo, memoize } from "@/lib/github/client";
import { computeSummary } from "@/lib/github/types";
import type { RunStatus } from "@/lib/github/types";

export const dynamic = "force-dynamic";

// Hard cap: the whole GET must complete within this time
const ROUTE_TIMEOUT_MS = 12_000;
// Pollers (dashboard, sidebar badge, multiple tabs) share one upstream fetch
const RUNS_MEMO_TTL_MS = 4_000;
const RUNS_MEMO_PREFIX = "gh:runs:";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const status = searchParams.get("status") as RunStatus | null;
    const repoFilter = searchParams.get("repo");

    const fetchData = async () => {
      const repos = await listUserRepos(30);
      const filteredRepos = repoFilter
        ? repos.filter((r) => r.fullName === repoFilter)
        : repos;

      const runs = await listAllRuns(filteredRepos, {
        status: status ?? undefined,
        perPage: 20,
      });

      const summary = computeSummary(runs);
      const repoNames = [...new Set(runs.map((r) => r.repoFullName))].sort();
      const workflowNames = [...new Set(runs.map((r) => r.workflowName))].sort();

      return { runs, summary, repos: repoNames, workflows: workflowNames };
    };

    // Race the fetch against a timeout so the UI never spins indefinitely
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("GitHub data fetch timed out")), ROUTE_TIMEOUT_MS);
    });

    try {
      const data = await Promise.race([
        memoize(`${RUNS_MEMO_PREFIX}${status ?? ""}:${repoFilter ?? ""}`, RUNS_MEMO_TTL_MS, fetchData),
        timeoutPromise,
      ]);
      return NextResponse.json(data);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list runs" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action: "rerun" | "rerun-failed" | "cancel";
      repoFullName: string;
      runId: number;
    };

    const { action, repoFullName, runId } = body;

    if (!action || !repoFullName || !Number.isInteger(runId) || runId <= 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    switch (action) {
      case "rerun":
        await rerunWorkflowRun(repoFullName, runId);
        break;
      case "rerun-failed":
        await rerunFailedJobs(repoFullName, runId);
        break;
      case "cancel":
        await cancelWorkflowRun(repoFullName, runId);
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    invalidateMemo(RUNS_MEMO_PREFIX);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 },
    );
  }
}
