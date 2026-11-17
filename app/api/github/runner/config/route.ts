import { NextResponse } from "next/server";
import { configView, saveConfig } from "@/lib/runner/config";
import { clearRunnerCache } from "@/lib/runner/ssh";
import { isSameOriginJson } from "@/lib/same-origin";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ config: configView() });
}

/** Body: `{ host?, user?, scope? }` (strings) — empty values remove that saved override. */
export async function PUT(req: Request) {
  // Changing the host redirects where Flightdeck SSHes with your Entra identity.
  if (!isSameOriginJson(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { host?: unknown; user?: unknown; scope?: unknown } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    saveConfig({
      host: typeof body.host === "string" ? body.host : undefined,
      user: typeof body.user === "string" ? body.user : undefined,
      scope: typeof body.scope === "string" ? body.scope : undefined,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
  clearRunnerCache();
  return NextResponse.json({ config: configView() });
}
