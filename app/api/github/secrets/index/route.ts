import { NextRequest, NextResponse } from "next/server";
import { getSecretsIndexResponse } from "@/lib/github/secrets-indexer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await getSecretsIndexResponse(false);
    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load secrets index" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { force?: boolean };
    const response = await getSecretsIndexResponse(body.force ?? true);
    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to refresh secrets index" },
      { status: 500 },
    );
  }
}
