import { NextResponse } from "next/server";
import { configView, saveConfig } from "@/lib/runner/config";
import { clearRunnerCache } from "@/lib/runner/ssh";

export const dynamic = "force-dynamic";

/** Changing the host redirects the SSH password, so only accept same-origin JSON writes. */
function isSameOriginJson(req: Request): boolean {
  if (!req.headers.get("content-type")?.startsWith("application/json")) return false;
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser client (curl, tests)
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export async function GET() {
  return NextResponse.json({ config: configView() });
}

/** Body: `{ host?: string, user?: string }` — empty values remove that saved override. */
export async function PUT(req: Request) {
  if (!isSameOriginJson(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { host?: unknown; user?: unknown } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    saveConfig({
      host: typeof body.host === "string" ? body.host : undefined,
      user: typeof body.user === "string" ? body.user : undefined,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
  clearRunnerCache();
  return NextResponse.json({ config: configView() });
}
