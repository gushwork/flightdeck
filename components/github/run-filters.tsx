"use client";

import { SearchableSelect } from "@/components/searchable-select";

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
  "shrink-0 rounded-lg border border-(--border) bg-(--bg-field) px-2.5 py-1.5 text-xs text-(--text-primary) outline-none transition-colors focus:border-(--accent) focus:ring-1 focus:ring-(--accent)/30 min-w-0";

const branchInputClass =
  "w-[7.5rem] shrink-0 rounded-lg border border-(--border) bg-(--bg-field) py-1.5 pl-7 pr-2.5 text-xs text-(--text-primary) font-(family-name:--font-mono) outline-none transition-colors placeholder:text-(--text-faint) placeholder:font-(family-name:--font-sans) focus:border-(--accent) focus:ring-1 focus:ring-(--accent)/30 sm:w-36";

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

  const repoOptions = [
    { value: "", label: "All repos" },
    ...repos.map((r) => ({
      value: r,
      label: r.split("/")[1] ?? r,
    })),
  ];

  const workflowOptions = [
    { value: "", label: "All workflows" },
    ...workflows.map((w) => ({ value: w, label: w })),
  ];

  const sortOptions = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
  ];

  return (
    <div
      className="-mx-0.5 flex flex-nowrap items-center gap-2 overflow-x-auto px-0.5 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-(--border-subtle)"
      role="toolbar"
      aria-label="Run filters"
    >
      <SearchableSelect
        value={status}
        onValueChange={onStatusChange}
        className={`${selectClass} min-w-[8.75rem] max-w-[12rem]`}
        aria-label="Filter by status"
        searchPlaceholder="Search statuses…"
        options={statusOptions}
        shortcutFocusFirst
        variant="panel"
      />

      {repos.length > 0 && (
        <SearchableSelect
          value={repo}
          onValueChange={onRepoChange}
          className={`${selectClass} min-w-[13rem] max-w-[20rem]`}
          aria-label="Filter by repository"
          searchPlaceholder="Search repos…"
          options={repoOptions}
          variant="panel"
        />
      )}

      {workflows.length > 0 && (
        <SearchableSelect
          value={workflow}
          onValueChange={onWorkflowChange}
          className={`${selectClass} min-w-[12rem] max-w-[18rem]`}
          aria-label="Filter by workflow"
          searchPlaceholder="Search workflows…"
          options={workflowOptions}
          variant="panel"
        />
      )}

      <div className="relative shrink-0">
        <input
          ref={branchInputRef}
          type="text"
          value={branch}
          onChange={(e) => onBranchChange(e.target.value)}
          placeholder="Branch…"
          className={branchInputClass}
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

      <SearchableSelect
        value={sort}
        onValueChange={(v) => onSortChange(v as "newest" | "oldest")}
        className={`${selectClass} min-w-[8.5rem] max-w-[11rem]`}
        aria-label="Sort order"
        searchPlaceholder="Search…"
        options={sortOptions}
        variant="panel"
      />

      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            onStatusChange("");
            onRepoChange("");
            onWorkflowChange("");
            onBranchChange("");
          }}
          className="shrink-0 rounded-lg border border-(--border) bg-(--bg-surface) px-2.5 py-1.5 text-xs text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-secondary)"
        >
          Clear
        </button>
      )}
    </div>
  );
}
