import Link from "next/link";

export default function DesignSystemPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 pb-16">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--accent)">
          Reference
        </p>
        <h1 className="mt-2 font-(family-name:--font-display) text-2xl font-medium tracking-tight text-(--text-primary)">
          Design system
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-(--text-secondary)">
          Flightdeck UI conventions: tokens, typography, sidebar behavior, and
          interaction patterns. Full implementation detail for agents and
          contributors lives in the repo rule file (
          <code className="rounded bg-(--bg-muted) px-1.5 py-0.5 font-(family-name:--font-mono) text-[11px] text-(--text-muted)">
            .cursor/rules/design-system.mdc
          </code>
          ).
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-(--text-primary)">
          Tokens and global styles
        </h2>
        <p className="text-sm leading-relaxed text-(--text-secondary)">
          CSS custom properties are defined in{" "}
          <code className="rounded bg-(--bg-muted) px-1.5 py-0.5 font-(family-name:--font-mono) text-[11px]">
            app/globals.css
          </code>
          . Prefer Tailwind utilities that reference tokens, for example{" "}
          <code className="font-(family-name:--font-mono) text-[11px]">
            bg-(--bg-elevated)
          </code>
          ,{" "}
          <code className="font-(family-name:--font-mono) text-[11px]">
            text-(--text-secondary)
          </code>
          , and{" "}
          <code className="font-(family-name:--font-mono) text-[11px]">
            border-(--border-hairline)
          </code>
          .
        </p>
        <div className="overflow-hidden rounded-xl border border-(--border-hairline)">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-(--border-hairline) bg-(--bg-muted)">
                <th className="px-4 py-2 text-left font-medium text-(--text-primary)">Token</th>
                <th className="px-4 py-2 text-left font-medium text-(--text-primary)">Usage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--border-hairline)">
              {[
                ["--text-primary", "Body copy, headings"],
                ["--text-secondary", "Supporting text, descriptions"],
                ["--text-muted", "Placeholder, labels, captions"],
                ["--text-faint", "Disabled states, ghost text"],
                ["--bg-muted", "Subtle surface tint, code chips"],
                ["--bg-elevated", "Card and panel backgrounds"],
                ["--bg-card", "Card background (alias for elevated)"],
                ["--border", "Standard border"],
                ["--border-hairline", "Subtle 1px dividers"],
                ["--accent", "Brand / interactive color"],
                ["--success-muted", "Success background wash"],
                ["--success-dim", "Success secondary background"],
                ["--warn-muted", "Warning background wash"],
                ["--warn-dim", "Warning secondary background"],
                ["--danger-muted", "Danger / error background wash"],
                ["--danger-dim", "Danger secondary background"],
              ].map(([token, usage]) => (
                <tr key={token}>
                  <td className="px-4 py-2 font-(family-name:--font-mono) text-[11px] text-(--accent)">
                    {token}
                  </td>
                  <td className="px-4 py-2 text-(--text-secondary)">{usage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-(--text-primary)">
          Sidebar navigation
        </h2>
        <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-(--text-secondary)">
          <li>
            <strong className="font-medium text-(--text-primary)">
              Registry-driven:
            </strong>{" "}
            links and grouping come from{" "}
            <code className="font-(family-name:--font-mono) text-[11px]">
              lib/modules/registry.ts
            </code>{" "}
            (<code className="font-(family-name:--font-mono) text-[11px]">
              MODULE_NAV
            </code>
            ,{" "}
            <code className="font-(family-name:--font-mono) text-[11px]">
              SIDEBAR_SERVICE_GROUPS
            </code>
            ). Icons and layout stay in{" "}
            <code className="font-(family-name:--font-mono) text-[11px]">
              components/layout/sidebar.tsx
            </code>
            .
          </li>
          <li>
            <strong className="font-medium text-(--text-primary)">
              AWS section:
            </strong>{" "}
            collapsible shell with hub link to{" "}
            <code className="font-(family-name:--font-mono) text-[11px]">
              /aws
            </code>
            ; nested Secrets, Amplify, Access Analyzer, and IAM modules inside
            when expanded. GitHub and Fly.io sections are also collapsible in
            the same way.
          </li>
          <li>
            <strong className="font-medium text-(--text-primary)">
              Expand all / Collapse all:
            </strong>{" "}
            top row above Dashboard; opens or closes every collapsible block
            (AWS shell plus each parent-with-children from the registry).
          </li>
          <li>
            <strong className="font-medium text-(--text-primary)">
              Service hubs:
            </strong>{" "}
            parent rows use official-style brand marks (AWS, GitHub, Fly.io)
            where applicable — the only intentional raw hex fills in the chrome.
          </li>
          <li>
            <strong className="font-medium text-(--text-primary)">
              Route sync:
            </strong>{" "}
            navigating to a deep link still auto-expands the relevant section
            so items stay visible.
          </li>
          <li>
            <strong className="font-medium text-(--text-primary)">
              GitHub activity:
            </strong>{" "}
            pulsing dot beside Actions when runs are queued or in progress.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-(--text-primary)">
          Where to read more
        </h2>
        <p className="text-sm leading-relaxed text-(--text-secondary)">
          Stat cards, run cards, polling intervals, sticky filters, mutation UX,
          and accessibility expectations are documented in the same rule file.
          Keep this page as a short operator-facing summary; extend the rule
          when you introduce new patterns.
        </p>
        <p className="text-sm text-(--text-muted)">
          <Link
            href="/settings"
            className="font-medium text-(--accent) hover:underline"
          >
            Settings
          </Link>{" "}
          includes a link back here for discoverability.
        </p>
      </section>
    </div>
  );
}
