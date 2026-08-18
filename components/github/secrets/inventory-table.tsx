"use client";

import type { GHSecretInventoryRow } from "@/lib/github/secrets-types";

const DEFAULT_PAGE_SIZE = 50;

export function SecretsInventoryTable({
  rows,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  onPageChange,
  selected,
  onToggleSelect,
  onSelectRepo,
}: {
  rows: GHSecretInventoryRow[];
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  selected?: Set<string>;
  onToggleSelect?: (rowKey: string) => void;
  onSelectRepo?: (fullName: string) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-medium text-(--text-secondary)">No secrets or variables found</p>
        <p className="mt-1 text-xs text-(--text-muted)">Try refreshing the index or adjusting filters.</p>
      </div>
    );
  }

  const rowKey = (r: GHSecretInventoryRow) =>
    `${r.platform}:${r.scope}:${r.ownerLogin}:${r.repoFullName ?? ""}:${r.environmentName ?? ""}:${r.kind}:${r.name}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-(--border-hairline) bg-(--bg-elevated) shadow-sm">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-(--border-hairline) text-(--text-muted)">
              {onToggleSelect && <th className="w-8 px-3 py-2" />}
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Kind</th>
              <th className="px-4 py-2 font-medium">Scope</th>
              <th className="px-4 py-2 font-medium">Platform</th>
              <th className="px-4 py-2 font-medium">Location</th>
              <th className="px-4 py-2 font-medium">Value</th>
              <th className="px-4 py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const key = rowKey(row);
              const location = [row.ownerLogin, row.repoFullName, row.environmentName]
                .filter(Boolean)
                .join(" / ");

              return (
                <tr
                  key={key}
                  className="border-t border-(--border-hairline) hover:bg-(--bg-hover)"
                >
                  {onToggleSelect && (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected?.has(key) ?? false}
                        onChange={() => onToggleSelect(key)}
                        className="rounded border-(--border)"
                      />
                    </td>
                  )}
                  <td className="px-4 py-2 font-(family-name:--font-mono) font-medium text-(--text-primary)">
                    {row.name}
                  </td>
                  <td className="px-4 py-2 text-(--text-secondary)">{row.kind}</td>
                  <td className="px-4 py-2 text-(--text-secondary)">{row.scope}</td>
                  <td className="px-4 py-2 text-(--text-secondary)">{row.platform}</td>
                  <td className="px-4 py-2">
                    {row.repoFullName ? (
                      <button
                        type="button"
                        onClick={() => onSelectRepo?.(row.repoFullName!)}
                        className="text-(--accent) hover:underline"
                        title="Open repo cockpit for variable values"
                      >
                        {location}
                      </button>
                    ) : (
                      <span className="text-(--text-secondary)">{location}</span>
                    )}
                    {row.accessError && (
                      <div className="text-[10px] text-(--danger)">{row.accessError}</div>
                    )}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-2 font-(family-name:--font-mono) text-(--text-faint)">
                    {row.kind === "variable" ? (
                      row.value ? (
                        row.value
                      ) : (
                        <span title="Open repo to view variable values">—</span>
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-(--text-faint)">
                    {row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {onPageChange && rows.length > pageSize && (
        <div className="flex items-center justify-between text-xs text-(--text-secondary)">
          <span>
            Showing {start + 1}–{Math.min(start + pageSize, rows.length)} of {rows.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => onPageChange(safePage - 1)}
              className="rounded-lg border border-(--border) px-3 py-1.5 hover:bg-(--bg-hover) disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-2 py-1.5 tabular-nums">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => onPageChange(safePage + 1)}
              className="rounded-lg border border-(--border) px-3 py-1.5 hover:bg-(--bg-hover) disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function inventoryRowKey(row: GHSecretInventoryRow): string {
  return `${row.platform}:${row.scope}:${row.ownerLogin}:${row.repoFullName ?? ""}:${row.environmentName ?? ""}:${row.kind}:${row.name}`;
}
