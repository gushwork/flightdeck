import { NextResponse } from "next/server";
import { listSecrets, setSecrets, unsetSecrets } from "@/lib/fly/cli";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ app: string }> },
) {
  const { app } = await params;
  try {
    const secrets = await listSecrets(decodeURIComponent(app));
    return NextResponse.json({ secrets });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ app: string }> },
) {
  const { app } = await params;
  const appName = decodeURIComponent(app);
  const body = (await req.json()) as {
    set?: Record<string, string>;
    unset?: string[];
  };

  try {
    if (body.set && Object.keys(body.set).length > 0) {
      await setSecrets(appName, body.set);
    }
    if (body.unset && body.unset.length > 0) {
      await unsetSecrets(appName, body.unset);
    }
    const secrets = await listSecrets(appName);
    return NextResponse.json({ secrets, ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
