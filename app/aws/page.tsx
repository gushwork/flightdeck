import Link from "next/link";
import {
  getAwsOverviewLead,
  getAwsOverviewSubsections,
  overviewAccentCardClass,
} from "@/lib/modules/overview-directory";

export default function AwsOverviewPage() {
  const lead = getAwsOverviewLead();
  const subsections = getAwsOverviewSubsections();

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <header className="relative overflow-hidden rounded-2xl border border-(--border-hairline) bg-(--bg-elevated) px-6 py-8 shadow-sm sm:px-8">
        <div
          className="pointer-events-none absolute -right-8 -top-12 h-40 w-40 rounded-full bg-(--accent)/12 blur-3xl"
          aria-hidden
        />
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--accent)">
          Platforms
        </p>
        <h1 className="mt-2 font-(family-name:--font-display) text-3xl font-medium tracking-tight text-(--text-primary)">
          AWS in this workspace
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-(--text-secondary)">{lead}</p>
      </header>

      <div className="space-y-10">
        {subsections.map((sub) => (
          <section key={sub.id} aria-labelledby={`aws-sub-${sub.id}`}>
            <h2
              id={`aws-sub-${sub.id}`}
              className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--text-muted)"
            >
              {sub.title}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {sub.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`group rounded-xl border p-5 transition-colors ${overviewAccentCardClass(sub.accent)}`}
                >
                  <h3 className="text-base font-semibold text-(--text-primary) group-hover:text-(--accent)">
                    {link.label}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                    {link.description}
                  </p>
                  <span className="mt-3 inline-block text-xs font-medium text-(--accent)">
                    Open →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
