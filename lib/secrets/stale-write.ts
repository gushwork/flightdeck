/**
 * Optimistic concurrency for whole-secret saves. The value editor sends the version it loaded;
 * if AWSCURRENT has moved on since (another tab, teammate, rotation, script), saving the edited
 * copy would silently revert every change made in between, so the write is refused instead.
 */
export function staleWriteError(expectedVersionId: unknown, currentVersionId: string | undefined): string | null {
  if (typeof expectedVersionId !== 'string' || expectedVersionId === '') return null;
  if (expectedVersionId === currentVersionId) return null;
  return (
    'This secret changed after you opened it (current version ' +
    `${(currentVersionId ?? 'unknown').slice(0, 12)}…). Saving your copy would undo those changes. ` +
    'Reload the secret and re-apply your edit.'
  );
}
