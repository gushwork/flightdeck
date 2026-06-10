"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import type { GHRunsSummary } from "@/lib/github/types";
import {
  getGithubActivitySnapshot,
  setGithubActivityFromSummary,
  subscribeGithubActivity,
} from "@/lib/github/github-activity-store";

const OFF_GITHUB_POLL_MS = 120_000;

/**
 * Nav badge: minimal activity (in progress / queued). On `/github/*`,
 * `github-data-store` updates the activity store whenever workflow summary changes.
 * Off that route, a slow background poll keeps the badge roughly fresh (only while
 * the document tab is visible).
 */
export function useGithubNavActivity() {
  const pathname = usePathname();
  const activity = useSyncExternalStore(
    subscribeGithubActivity,
    getGithubActivitySnapshot,
    getGithubActivitySnapshot,
  );

  const hasActiveRuns = activity.inProgress > 0 || activity.queued > 0;

  useEffect(() => {
    if (pathname.startsWith("/github")) {
      return;
    }

    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      void (async () => {
        try {
          const res = await fetch("/api/github/actions/runs");
          const data = (await res.json()) as {
            summary?: GHRunsSummary;
            error?: string;
          };
          if (data.error) return;
          if (data.summary) setGithubActivityFromSummary(data.summary);
        } catch {
          // ignore
        }
      })();
    };

    tick();
    const id = setInterval(tick, OFF_GITHUB_POLL_MS);

    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [pathname]);

  return { hasActiveRuns, activity };
}
