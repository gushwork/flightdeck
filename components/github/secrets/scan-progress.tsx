"use client";

export function SecretsScanProgress({
  active,
  message,
}: {
  active: boolean;
  message?: string;
}) {
  if (!active) return null;
  return (
    <div className="rounded-lg border border-(--accent)/20 bg-(--accent-dim) px-4 py-3 text-xs text-(--accent)">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--accent) opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-(--accent)" />
        </span>
        {message ?? "Scanning repositories…"}
      </div>
    </div>
  );
}
