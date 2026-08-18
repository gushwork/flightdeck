import { NextRequest, NextResponse } from "next/server";
import { executeBulkMutations } from "@/lib/github/secrets-bulk";
import type { GHSecretsMutationRequest } from "@/lib/github/secrets-types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GHSecretsMutationRequest;

    if (!body.action || !Array.isArray(body.targets) || body.targets.length === 0) {
      return NextResponse.json(
        { error: "action and at least one target required" },
        { status: 400 },
      );
    }

    if (
      (body.action === "set-secret" || body.action === "set-variable") &&
      !body.preview &&
      !body.value
    ) {
      return NextResponse.json({ error: "value required for set actions" }, { status: 400 });
    }

    const response = await executeBulkMutations(body);
    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bulk mutation failed" },
      { status: 500 },
    );
  }
}
