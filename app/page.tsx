"use client";

import Link from "next/link";
import { PlatformSpotlights } from "@/components/dashboard/platform-spotlights";
import { ServiceDirectory } from "@/components/dashboard/service-directory";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="relative overflow-hidden rounded-2xl border border-(--border-hairline) bg-(--bg-elevated) px-6 py-7 shadow-sm sm:px-8 sm:py-8">
        <div
          className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-(--accent)/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-(--success)/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-4 right-1/4 h-32 w-32 rounded-full bg-(--warn)/8 blur-2xl"
          aria-hidden
        />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
            Flightdeck
          </p>
          <h1 className="mt-2 font-(family-name:--font-display) text-3xl font-medium tracking-tight text-(--text-primary) sm:text-4xl">
            Operations dashboard
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-(--text-secondary)">
            Pick a platform below, then drill into tools. Secrets metrics live on{" "}
            <Link
              href="/secrets/overview"
              className="font-medium text-(--accent) underline decoration-(--accent)/30 underline-offset-2 hover:decoration-(--accent)"
            >
              Workspace insights
            </Link>
            .
          </p>
        </div>
      </header>

      <PlatformSpotlights />

      <section aria-labelledby="directory-heading" id="services-directory">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2
            id="directory-heading"
            className="font-(family-name:--font-display) text-xl text-(--text-primary)"
          >
            All tools
          </h2>
          <span className="text-[11px] text-(--text-faint)">
            Two columns on wide screens · click a header to expand
          </span>
        </div>
        <ServiceDirectory />
      </section>
    </div>
  );
}
