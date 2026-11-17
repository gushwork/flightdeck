import { NextResponse, type NextRequest } from "next/server";
import { isCrossSiteWrite } from "@/lib/same-origin";

/**
 * The app has no login, so any page open in the operator's browser can reach it on loopback.
 * Refuse state-changing API calls that a browser sent from another site (CSRF).
 */
export function proxy(request: NextRequest) {
  if (isCrossSiteWrite(request)) {
    return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
