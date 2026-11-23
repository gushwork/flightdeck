import type { NextRequest } from 'next/server';
import { getRegion, parseProfileParam } from '@/lib/aws/client';
import { applyMfaChange, getMfaOverview } from '@/lib/aws/iam-mfa';
import { parseMfaChangeRequest } from '@/lib/iam/mfa';
import { isSameOriginJson } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

/** Every IAM user with MFA device, sign-in methods and whether FlightdeckEnforceMFA applies. */
export async function GET(request: NextRequest) {
  try {
    const region = getRegion(request.nextUrl.searchParams.get('region') ?? undefined);
    const profile = parseProfileParam(request.nextUrl.searchParams.get('profile'));
    const overview = await getMfaOverview(region, profile);
    return Response.json(overview, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * Body: `{ region, profile?, action: "enforce" | "remove", userNames?: string[], allUsers?: true }`.
 * Attaches or detaches FlightdeckEnforceMFA per user and returns a per-user result.
 */
export async function POST(request: NextRequest) {
  // Changes what every targeted user can do in the account: same-origin JSON only.
  if (!isSameOriginJson(request)) {
    return Response.json({ error: 'Same-origin JSON request required' }, { status: 403 });
  }
  try {
    const body = await request.json();
    const parsed = parseMfaChangeRequest(body);
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    const region = getRegion(body.region);
    const profile = parseProfileParam(body.profile as string | undefined);
    const result = await applyMfaChange(region, profile, parsed.action, parsed.target);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
