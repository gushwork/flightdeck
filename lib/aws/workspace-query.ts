/** Build search params for API routes that accept region + optional profile. */
export function workspaceSearchParams(
  region: string,
  profile: string,
): URLSearchParams {
  const p = new URLSearchParams({ region });
  const prof = profile.trim();
  if (prof) p.set('profile', prof);
  return p;
}
