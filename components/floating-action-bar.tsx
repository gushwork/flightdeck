"use client";

interface FloatingAction {
  label: string;
  onClick: () => void;
  variant?: "danger" | "default" | "accent";
}

interface FloatingActionBarProps {
  count: number;
  actions: FloatingAction[];
  onClear?: () => void;
}

export function FloatingActionBar({
  count,
  actions,
  onClear,
}: FloatingActionBarProps) {
  if (count === 0) return null;

  const variantClass = (v?: string) => {
    switch (v) {
      case "danger":
        return "border-[var(--danger)]/30 bg-[var(--danger-dim)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white";
      case "accent":
        return "border-[var(--accent)]/30 bg-[var(--accent-dim)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white";
      default:
        return "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]";
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 animate-[slideUp_0.2s_ease-out]">
      <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-deep)] px-5 py-2.5 shadow-lg shadow-black/8">
        <span className="text-xs font-medium text-[var(--text-primary)] tabular-nums">
          {count} selected
        </span>

        <div className="h-4 w-px bg-[var(--border)]" />

        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${variantClass(action.variant)}`}
          >
            {action.label}
          </button>
        ))}

        {onClear && (
          <>
            <div className="h-4 w-px bg-[var(--border)]" />
            <button
              onClick={onClear}
              className="rounded-lg p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              title="Clear selection"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
