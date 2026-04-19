"use client";

interface RunFiltersProps {
  status: string;
  repo: string;
  workflow: string;
  branch: string;
  sort: "newest" | "oldest";
  repos: string[];
  workflows: string[];
  onStatusChange: (v: string) => void;
  onRepoChange: (v: string) => void;
  onWorkflowChange: (v: string) => void;
  onBranchChange: (v: string) => void;
  onSortChange: (v: "newest" | "oldest") => void;
  branchInputRef?: React.RefObject<HTMLInputElement | null>;
}

const statusOptions = [
  { value: "", label: "All statuses" },
  { value: "in_progress", label: "In progress" },
  { value: "queued", label: "Queued" },
  { value: "success", label: "Success" },
  { value: "failure", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "skipped", label: "Skipped" },
];

const selectClass =
  "rounded-lg border border-(--border) bg-(--bg-field) px-2.5 py-1.5 text-xs text-(--text-primary) outline-none transition-colors focus:border-(--accent) focus:ring-1 focus:ring-(--accent)/30 min-w-0";

export function RunFilters({
  status,
  repo,
  workflow,
  branch,
  sort,
  repos,
  workflows,
  onStatusChange,
  onRepoChange,
  onWorkflowChange,
  onBranchChange,
  onSortChange,
  branchInputRef,
}: RunFiltersProps) {
  const hasFilters = !!status || !!repo || !!workflow || !!branch;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={status}
        onChange={(e) => onStatusChange(e.target.value)}
        className={selectClass}
        aria-label="Filter by status"
      >
        {statusOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {repos.length > 0 && (
        <select
          value={repo}
          onChange={(e) => onRepoChange(e.target.value)}
          className={selectClass}
          aria-label="Filter by repository"
        >
          <option value="">All repos</option>
          {repos.map((r) => (
            <option key={r} value={r}>
              {r.split("/")[1] ?? r}
            </option>
          ))}
        </select>
      )}

      {workflows.length > 0 && (
        <select
          value={workflow}
          onChange={(e) => onWorkflowChange(e.target.value)}
          className={`${selectClass} max-w-[160px]`}
          aria-label="Filter by workflow"
        >
          <option value="">All workflows</option>
          {workflows.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      )}

      <div className="relative">
        <input
          ref={branchInputRef}
          type="text"
          value={branch}
          onChange={(e) => onBranchChange(e.target.value)}
          placeholder="Branch…"
          className="rounded-lg border border-(--border) bg-(--bg-field) py-1.5 pl-7 pr-2.5 text-xs text-(--text-primary) font-(family-name:--font-mono) outline-none transition-colors placeholder:text-(--text-faint) placeholder:font-sans focus:border-(--accent) focus:ring-1 focus:ring-(--accent)/30"
          aria-label="Filter by branch"
        />
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-(--text-faint)"
        >
          <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 019 8.5H7a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 017 7h2a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
        </svg>
      </div>

      <select
        value={sort}
        onChange={(e) => onSortChange(e.target.value as "newest" | "oldest")}
        className={selectClass}
        aria-label="Sort order"
      >
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
      </select>

      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            onStatusChange("");
            onRepoChange("");
            onWorkflowChange("");
            onBranchChange("");
          }}
          className="rounded-lg border border-(--border) bg-(--bg-surface) px-2.5 py-1.5 text-xs text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-secondary)"
        >
          Clear
        </button>
      )}
    </div>
  );
}
