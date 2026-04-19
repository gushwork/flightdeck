import Link from "next/link";

export default function IamOverviewPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-(family-name:--font-display) text-2xl font-medium tracking-tight text-(--text-primary)">
        IAM
      </h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-(--text-secondary)">
        Utilities for working with IAM across named AWS profiles. IAM entity
        names are unique per account (global IAM); the workspace region is used
        for API clients only.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link
          href="/iam/cross-account-copy"
          className="group rounded-xl border border-(--border) bg-(--bg-field) p-5 transition-colors hover:border-(--accent)/40 hover:bg-(--bg-surface)"
        >
          <h2 className="text-base font-semibold text-(--text-primary) group-hover:text-(--accent)">
            Cross-account copy
          </h2>
          <p className="mt-2 text-sm text-(--text-secondary)">
            Search roles, users, and customer-managed policies in the source
            profile, then copy them to another account using a target profile.
            Collisions can be resolved with an optional overwrite.
          </p>
          <span className="mt-3 inline-block text-xs font-medium text-(--accent)">
            Open tool →
          </span>
        </Link>

        <Link
          href="/iam/create-user"
          className="group rounded-xl border border-(--border) bg-(--bg-field) p-5 transition-colors hover:border-(--accent)/40 hover:bg-(--bg-surface)"
        >
          <h2 className="text-base font-semibold text-(--text-primary) group-hover:text-(--accent)">
            Create user
          </h2>
          <p className="mt-2 text-sm text-(--text-secondary)">
            Create IAM user with console password (force change on next login),
            access key pair, and permissions cloned from a template user.
          </p>
          <span className="mt-3 inline-block text-xs font-medium text-(--accent)">
            Open tool →
          </span>
        </Link>
      </div>
    </div>
  );
}
