import { NextRequest, NextResponse } from "next/server";
import { filterIndex } from "@/lib/github/filter-index";
import { getSecretsIndexResponse } from "@/lib/github/secrets-indexer";
import type {
  GHSecretKind,
  GHSecretPlatform,
  GHSecretScope,
} from "@/lib/github/secrets-types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const { index } = await getSecretsIndexResponse(false);

    const params = {
      q: sp.get("q") ?? undefined,
      owner: sp.get("owner") ?? undefined,
      scope: (sp.get("scope") as GHSecretScope | null) ?? undefined,
      platform: (sp.get("platform") as GHSecretPlatform | null) ?? undefined,
      kind: (sp.get("kind") as GHSecretKind | null) ?? undefined,
      repo: sp.get("repo") ?? undefined,
      environment: sp.get("environment") ?? undefined,
    };

    const rows = filterIndex(index, params);
    return NextResponse.json({ rows, total: rows.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 },
    );
  }
}
