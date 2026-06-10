import type { GHRunsSummary } from "@/lib/github/types";

export type GithubActivitySnapshot = {
  inProgress: number;
  queued: number;
};

let snapshot: GithubActivitySnapshot = { inProgress: 0, queued: 0 };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getGithubActivitySnapshot(): GithubActivitySnapshot {
  return snapshot;
}

export function subscribeGithubActivity(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

/** Only notifies subscribers when inProgress/queued change (avoids extra sidebar renders). */
export function setGithubActivityFromSummary(s: GHRunsSummary) {
  const next: GithubActivitySnapshot = {
    inProgress: s.inProgress,
    queued: s.queued,
  };
  if (
    next.inProgress === snapshot.inProgress &&
    next.queued === snapshot.queued
  ) {
    return;
  }
  snapshot = next;
  emit();
}
