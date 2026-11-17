import { NextResponse } from "next/server";
import { changeSshAccess, getSshAccess } from "@/lib/runner/nsg";
import type { RunnerSshAction } from "@/lib/runner/types";
import { isSameOriginJson } from "@/lib/same-origin";

export const dynamic = "force-dynamic";

function failure(err: unknown) {
  return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
}

/** Who can reach the runner VM's SSH port (read from its NSG). */
export async function GET() {
  try {
    return NextResponse.json({ access: await getSshAccess() });
  } catch (err) {
    return failure(err);
  }
}

function parseAction(body: unknown): RunnerSshAction | null {
  if (!body || typeof body !== "object") return null;
  const { action, source } = body as { action?: unknown; source?: unknown };
  if (action === "allow-my-ip" || action === "close") return { action };
  if (action === "remove" && typeof source === "string" && source.trim()) return { action, source: source.trim() };
  return null;
}

/**
 * Body: `{ action: "allow-my-ip" }`, `{ action: "remove", source }` or `{ action: "close" }`.
 * "allow-my-ip" uses the IP the server looks up itself, never one from the request.
 */
export async function POST(req: Request) {
  if (!isSameOriginJson(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const input = parseAction(await req.json().catch(() => null));
  if (!input) {
    return NextResponse.json({ error: "Expected { action: 'allow-my-ip' | 'close' } or { action: 'remove', source }" }, { status: 400 });
  }
  try {
    return NextResponse.json({ access: await changeSshAccess(input) });
  } catch (err) {
    return failure(err);
  }
}
