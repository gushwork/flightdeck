"use client";

import type { GHSecretsDriftRow } from "@/lib/github/secrets-types";

export function SecretsDriftMatrix({
  rows,
  onBulkFix,
}: {
  rows: GHSecretsDriftRow[];
  onBulkFix?: (name: string, kind: GHSecretsDriftRow["kind"]) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-(--text-muted)">No drift detected — secret names are consistent across repos.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-(--border-hairline)">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-(--border-hairline) bg-(--bg-field) text-(--text-muted)">
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Kind</th>
            <th className="px-4 py-2 font-medium">Present in</th>
            <th className="px-4 py-2 font-medium">Missing in</th>
            <th className="px-4 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.kind}-${row.name}`} className="border-t border-(--border-hairline)">
              <td className="px-4 py-2 font-(family-name:--font-mono) font-medium">{row.name}</td>
              <td className="px-4 py-2 text-(--text-secondary)">{row.kind}</td>
              <td className="px-4 py-2 font-(family-name:--font-mono) tabular-nums text-(--success)">
                {row.presentIn}
              </td>
              <td className="px-4 py-2 font-(family-name:--font-mono) tabular-nums text-(--warn)">
                {row.missingIn}
              </td>
              <td className="px-4 py-2">
                {onBulkFix && row.missingIn > 0 && (
                  <button
                    type="button"
                    onClick={() => onBulkFix(row.name, row.kind)}
                    className="text-(--accent) hover:underline"
                  >
                    Fix gaps
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
