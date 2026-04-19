import Link from "next/link";
import { DIRECTORY_GROUPS } from "@/lib/modules/overview-directory";

/**
 * Equal-weight AWS + GitHub entry points so both platforms are visible without scrolling past the full tool list.
 */
export function PlatformSpotlights() {
  const aws = DIRECTORY_GROUPS.find((g) => g.id === "aws");
  const github = DIRECTORY_GROUPS.find((g) => g.id === "github");
  if (!aws || !github) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
      <Link
        href="/aws"
        className="group relative overflow-hidden rounded-2xl border border-(--accent)/20 bg-[linear-gradient(145deg,var(--accent-muted),var(--bg-elevated)_70%)] p-5 shadow-sm transition-colors hover:border-(--accent)/35 sm:min-h-[140px]"
      >
        <div
          className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-(--accent)/10 blur-2xl"
          aria-hidden
        />
        <div className="relative flex h-full flex-col">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--accent)/12 text-(--accent)">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--accent)">
                Amazon Web Services
              </p>
              <p className="mt-1.5 text-sm leading-snug text-(--text-secondary)">
                {aws.lead}
              </p>
            </div>
          </div>
          <span className="mt-auto pt-4 text-sm font-semibold text-(--accent) group-hover:underline">
            AWS overview →
          </span>
        </div>
      </Link>

      <Link
        href="/github/overview"
        className="group relative overflow-hidden rounded-2xl border border-(--border-hairline) bg-(--bg-field) bg-[linear-gradient(145deg,color-mix(in_oklab,var(--text-secondary)_7%,transparent),var(--bg-elevated)_68%)] p-5 shadow-sm transition-colors hover:border-(--text-secondary)/25 sm:min-h-[140px]"
      >
        <div
          className="pointer-events-none absolute -left-4 -bottom-8 h-28 w-28 rounded-full bg-(--text-secondary)/8 blur-2xl"
          aria-hidden
        />
        <div className="relative flex h-full flex-col">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--text-secondary)/10 text-(--text-secondary)">
              <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--text-secondary)">
                GitHub
              </p>
              <p className="mt-1.5 text-sm leading-snug text-(--text-secondary)">
                {github.lead}
              </p>
            </div>
          </div>
          <span className="mt-auto pt-4 text-sm font-semibold text-(--text-primary) group-hover:text-(--accent) group-hover:underline">
            GitHub overview →
          </span>
        </div>
      </Link>
    </div>
  );
}
