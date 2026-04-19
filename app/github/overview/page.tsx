import Link from "next/link";
import {
  getGithubOverviewLead,
  getGithubOverviewLinks,
  overviewAccentCardClass,
  type OverviewAccent,
} from "@/lib/modules/overview-directory";

function linkTitleHoverClass(accent: OverviewAccent | undefined): string {
  switch (accent) {
    case "success":
      return "group-hover:text-(--success)";
    case "warn":
      return "group-hover:text-(--warn)";
    default:
      return "group-hover:text-(--accent)";
  }
}

function linkCtaClass(accent: OverviewAccent | undefined): string {
  switch (accent) {
    case "success":
      return "text-(--success)";
    case "warn":
      return "text-(--warn)";
    default:
      return "text-(--accent)";
  }
}

export default function GithubOverviewPage() {
  const lead = getGithubOverviewLead();
  const links = getGithubOverviewLinks();

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <header className="relative overflow-hidden rounded-2xl border border-(--border-hairline) bg-(--bg-elevated) px-6 py-8 shadow-sm sm:px-8">
        <div
          className="pointer-events-none absolute -right-10 -top-14 h-52 w-52 rounded-full bg-(--accent)/18 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-8 h-48 w-48 rounded-full bg-(--success)/12 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-6 right-1/3 h-36 w-36 rounded-full bg-(--warn)/10 blur-2xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
              GitHub
            </p>
            <h1 className="mt-2 font-(family-name:--font-display) text-3xl font-medium tracking-tight text-(--text-primary)">
              GitHub in this workspace
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-(--text-secondary)">
              {lead}
            </p>
            <p className="mt-4 text-sm text-(--text-muted)">
              Authentication uses the same token as the{" "}
              <code className="rounded border border-(--border-hairline) bg-(--accent-muted)/50 px-1.5 py-0.5 font-(family-name:--font-mono) text-[12px] text-(--text-primary)">
                gh
              </code>{" "}
              CLI. Configure profiles and connectivity in{" "}
              <Link href="/settings" className="font-medium text-(--accent) hover:underline">
                Settings
              </Link>
              .
            </p>
          </div>
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,var(--accent-muted),var(--success-muted))] text-(--accent) shadow-[inset_0_1px_0_0_rgba(79,70,229,0.15)] sm:mt-6"
            aria-hidden
          >
            <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </div>
        </div>
      </header>

      <section aria-labelledby="gh-links-heading">
        <h2
          id="gh-links-heading"
          className="mb-5 font-(family-name:--font-display) text-lg text-(--text-primary)"
        >
          Where to go next
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {links.map((link) => {
            const a = link.accent ?? "accent";
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`group block h-full rounded-xl border p-5 transition-colors ${overviewAccentCardClass(a)}`}
                >
                  <h3
                    className={`text-base font-semibold text-(--text-primary) transition-colors ${linkTitleHoverClass(link.accent)}`}
                  >
                    {link.label}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                    {link.description}
                  </p>
                  <span
                    className={`mt-4 inline-block text-xs font-semibold ${linkCtaClass(link.accent)}`}
                  >
                    Open →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
