import Link from "next/link";
import { Suspense } from "react";
import { FlyDomainsDashboard } from "@/components/route53/fly-domains-dashboard";

export default function FlyDomainsPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
          Route 53
        </p>
        <h1 className="mt-2 font-(family-name:--font-display) text-2xl font-medium text-(--text-primary)">
          Fly custom domains
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-(--text-secondary)">
          List Fly.io apps, highlight pending custom domain verification, and apply
          required DNS records to Route 53. Requires{" "}
          <code className="rounded border border-(--border-hairline) px-1 font-(family-name:--font-mono) text-xs">
            fly auth login
          </code>{" "}
          and an AWS profile from{" "}
          <Link href="/settings" className="text-(--accent) hover:underline">
            Settings
          </Link>
          .
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-(--text-muted)">Loading…</p>}>
        <FlyDomainsDashboard />
      </Suspense>
    </div>
  );
}
