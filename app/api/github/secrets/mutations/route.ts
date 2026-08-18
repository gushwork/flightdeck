import { NextRequest, NextResponse } from "next/server";
import { executeMutations } from "@/lib/github/secrets";
import { invalidateSecretsIndexCache } from "@/lib/github/secrets-indexer";
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

    if (body.targets.length > 1) {
      return NextResponse.json(
        { error: "Wave 1 supports single-target mutations only; use /api/github/secrets/bulk" },
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

    const response = await executeMutations(body);

    if (!body.preview && response.results.some((r) => r.ok)) {
      await invalidateSecretsIndexCache();
    }

    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Mutation failed" },
      { status: 500 },
    );
  }
}
