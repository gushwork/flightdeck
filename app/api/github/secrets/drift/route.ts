import { NextRequest, NextResponse } from "next/server";
import { computeDrift } from "@/lib/github/secrets-drift";
import type { GHSecretKind } from "@/lib/github/secrets-types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const response = await computeDrift({
      name: sp.get("name") ?? undefined,
      kind: (sp.get("kind") as GHSecretKind | null) ?? undefined,
      platform: "actions",
    });
    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Drift computation failed" },
      { status: 500 },
    );
  }
}
