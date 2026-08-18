import Link from "next/link";

export default function Route53HubPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--accent)">AWS</p>
        <h1 className="mt-2 font-(family-name:--font-display) text-2xl font-medium text-(--text-primary)">
          Route 53
        </h1>
        <p className="mt-2 text-sm text-(--text-secondary)">
          DNS tools scoped to your AWS profile and region.
        </p>
      </header>
      <Link
        href="/route53/fly-domains"
        className="group block rounded-xl border border-(--border) bg-(--bg-field) p-5 transition-colors hover:border-(--accent)/40 hover:bg-(--bg-surface)"
      >
        <h2 className="text-sm font-semibold text-(--text-primary) group-hover:text-(--accent)">
          Fly custom domains
        </h2>
        <p className="mt-1 text-xs text-(--text-muted)">
          Sync Fly.io certificate DNS requirements into Route 53 hosted zones.
        </p>
      </Link>
    </div>
  );
}
