import { NextResponse } from "next/server";
import { createRunnerVm, getFleet, killRunnerVm, listOperations, removeRegistration } from "@/lib/runner/fleet";
import { parseLabels } from "@/lib/runner/fleet-plan";
import type { RunnerFleetAction } from "@/lib/runner/types";
import { isSameOriginJson } from "@/lib/same-origin";

export const dynamic = "force-dynamic";

/** Runner VMs + GitHub registrations. `?only=operations` returns just the background operations (cheap, for polling). */
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("only") === "operations") {
    return NextResponse.json({ operations: listOperations() });
  }
  try {
    return NextResponse.json({ fleet: await getFleet() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

function parseAction(body: unknown): RunnerFleetAction | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.action === "kill" && typeof b.vm === "string" && typeof b.confirm === "string") {
    return { action: "kill", vm: b.vm, confirm: b.confirm };
  }
  if (b.action === "remove-registration" && typeof b.runnerId === "number" && Number.isInteger(b.runnerId)) {
    return { action: "remove-registration", runnerId: b.runnerId };
  }
  const input = b.input as Record<string, unknown> | undefined;
  if (b.action === "create" && input && typeof input.name === "string" && typeof input.size === "string") {
    const labels = Array.isArray(input.labels) ? input.labels.filter((l): l is string => typeof l === "string") : [];
    return {
      action: "create",
      input: { name: input.name.trim(), size: input.size.trim(), labels: parseLabels(labels.join(",")) },
    };
  }
  return null;
}

/**
 * Body: `{ action: "create", input: { name, size, labels } }`, `{ action: "kill", vm, confirm }`
 * (confirm must equal vm) or `{ action: "remove-registration", runnerId }`.
 * Create and kill run in the background and return `{ operation }`.
 */
export async function POST(req: Request) {
  if (!isSameOriginJson(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const input = parseAction(await req.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  try {
    if (input.action === "create") return NextResponse.json({ operation: await createRunnerVm(input.input) });
    if (input.action === "kill") return NextResponse.json({ operation: await killRunnerVm(input.vm, input.confirm) });
    await removeRegistration(input.runnerId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
