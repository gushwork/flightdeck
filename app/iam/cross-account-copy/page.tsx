"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import { OverwriteCopyDialog } from "@/components/iam/overwrite-copy-dialog";
import type { IamEntityType, IamSearchHit } from "@/lib/aws/iam";

const selectClass =
  "w-full max-w-md rounded-md border border-(--border) bg-(--bg-field) px-2 py-1.5 text-xs text-(--text-primary) outline-none transition-colors focus:border-(--accent) focus:ring-1 focus:ring-(--accent)/30";

function typeLabel(t: IamEntityType): string {
  switch (t) {
    case "role":
      return "Role";
    case "user":
      return "User";
    case "policy":
      return "Policy";
    default:
      return t;
  }
}

export default function IamCrossAccountCopyPage() {
  const { region, profile, profileOptions } = useAwsWorkspace();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [includeRoles, setIncludeRoles] = useState(true);
  const [includeUsers, setIncludeUsers] = useState(true);
  const [includePolicies, setIncludePolicies] = useState(true);
  const [results, setResults] = useState<IamSearchHit[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<IamSearchHit | null>(null);
  const [targetProfile, setTargetProfile] = useState("");
  const [accountIds, setAccountIds] = useState<Record<string, string>>({});
  const [sourceAccountId, setSourceAccountId] = useState<string | null>(null);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [overwriteChecked, setOverwriteChecked] = useState(false);
  const [pendingExistsDetail, setPendingExistsDetail] = useState<string | undefined>();
  /** When on: users copy IAM groups + membership; roles copy tags, permissions boundary, instance profiles; managed policies copy attaching principals (capped). */
  const [deepCopy, setDeepCopy] = useState(false);

  const namedProfiles = useMemo(
    () =>
      profileOptions.filter(
        (o) => o.value !== "" && o.value !== profile.trim(),
      ),
    [profileOptions, profile],
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = new URL("/api/iam/whoami", window.location.origin);
      u.searchParams.set("region", region);
      if (profile.trim()) u.searchParams.set("profile", profile);
      const r = await fetch(u);
      const j = await r.json();
      if (!cancelled && j.accountId) setSourceAccountId(j.accountId);
    })();
    return () => {
      cancelled = true;
    };
  }, [region, profile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries: [string, string][] = [];
      for (const o of namedProfiles) {
        const u = new URL("/api/iam/whoami", window.location.origin);
        u.searchParams.set("region", region);
        u.searchParams.set("profile", o.value);
        try {
          const r = await fetch(u);
          const j = await r.json();
          if (j.accountId) entries.push([o.value, j.accountId]);
        } catch {
          entries.push([o.value, "?"]);
        }
      }
      if (!cancelled) setAccountIds(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [region, namedProfiles]);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setTruncated(false);
      setSearchError(null);
      return;
    }

    const types: IamEntityType[] = [];
    if (includeRoles) types.push("role");
    if (includeUsers) types.push("user");
    if (includePolicies) types.push("policy");

    if (types.length === 0) {
      setResults([]);
      setSearchError("Select at least one entity type.");
      return;
    }

    let cancelled = false;
    (async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const r = await fetch("/api/iam/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            region,
            profile,
            query: debouncedQuery,
            types,
          }),
        });
        const j = await r.json();
        if (cancelled) return;
        if (j.error) {
          setSearchError(j.error);
          setResults([]);
          return;
        }
        setResults(j.results ?? []);
        setTruncated(Boolean(j.truncated));
      } catch (e) {
        if (!cancelled) {
          setSearchError(e instanceof Error ? e.message : "Search failed");
          setResults([]);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    debouncedQuery,
    region,
    profile,
    includeRoles,
    includeUsers,
    includePolicies,
  ]);

  const runCopy = useCallback(
    async (overwrite: boolean) => {
      if (!selected) return;
      if (!targetProfile.trim()) {
        setCopyError("Select a target profile (named profile required).");
        return;
      }
      setCopyLoading(true);
      setCopyError(null);
      setCopyMessage(null);
      try {
        const body: Record<string, unknown> = {
          region,
          sourceProfile: profile,
          targetProfile,
          entityType: selected.type,
          overwrite,
          deepCopy,
        };
        if (selected.type === "policy" && selected.inlineParent) {
          body.inlineSource = {
            kind: selected.inlineParent.kind,
            parentName: selected.inlineParent.name,
            policyName: selected.name,
          };
        } else if (selected.type === "policy") {
          body.sourcePolicyArn = selected.arn;
        } else if (selected.type === "role") {
          body.roleName = selected.name;
        } else {
          body.userName = selected.name;
        }
        const r = await fetch("/api/iam/copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await r.json();
        if (!r.ok) {
          throw new Error(j.error ?? "Copy failed");
        }
        setCopyMessage(
          selected.type === "policy"
            ? `Copied policy. Target ARN: ${j.policyArn ?? ""}`
            : selected.type === "role"
              ? `Copied role. Target ARN: ${j.roleArn ?? ""}`
              : `Copied user. Target ARN: ${j.userArn ?? ""}`,
        );
        setOverwriteOpen(false);
        setOverwriteChecked(false);
      } catch (e) {
        setCopyError(e instanceof Error ? e.message : "Copy failed");
      } finally {
        setCopyLoading(false);
      }
    },
    [region, profile, selected, targetProfile, deepCopy],
  );

  const handleCopyClick = useCallback(async () => {
    if (!selected || !targetProfile.trim()) {
      setCopyError("Select an entity and a target profile.");
      return;
    }
    setCopyError(null);
    setCopyMessage(null);
    try {
      const body: Record<string, unknown> = {
        region,
        targetProfile,
        entityType: selected.type,
      };
      if (selected.type === "policy" && selected.inlineParent) {
        body.inlineSource = {
          kind: selected.inlineParent.kind,
          parentName: selected.inlineParent.name,
          policyName: selected.name,
        };
      } else if (selected.type === "policy") {
        body.sourcePolicyArn = selected.arn;
      } else if (selected.type === "role") {
        body.roleName = selected.name;
      } else {
        body.userName = selected.name;
      }
      const r = await fetch("/api/iam/exists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not check target account");
      if (j.exists) {
        setPendingExistsDetail(j.detail);
        setOverwriteChecked(false);
        setOverwriteOpen(true);
        return;
      }
      await runCopy(false);
    } catch (e) {
      setCopyError(e instanceof Error ? e.message : "Exists check failed");
    }
  }, [region, selected, targetProfile, runCopy]);

  const targetLabel = (value: string) => {
    const id = accountIds[value];
    const opt = namedProfiles.find((o) => o.value === value);
    const base = opt?.label ?? value;
    return id ? `${base} (${id})` : base;
  };

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs text-(--text-muted)">
        <Link href="/iam" className="text-(--accent) hover:underline">
          IAM
        </Link>
        <span className="mx-1.5 text-(--text-faint)">/</span>
        Cross-account copy
      </p>
      <h1 className="mt-2 font-(family-name:--font-display) text-2xl font-medium tracking-tight text-(--text-primary)">
        Cross-account copy
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-(--text-secondary)">
        Source uses the workspace region and profile. Pick another{" "}
        <strong>named</strong> profile as the target. IAM is global per account;
        copying users does not move passwords, MFA, or access keys.
      </p>

      <div className="mt-6 rounded-lg border border-(--border-hairline) bg-(--bg-field) px-4 py-3 text-xs text-(--text-secondary)">
        <span className="font-medium text-(--text-primary)">Source: </span>
        {profile.trim() ? profile : "Default credential chain"}
        {sourceAccountId ? (
          <span className="ml-2 font-(family-name:--font-mono) text-(--text-muted)">
            {sourceAccountId}
          </span>
        ) : null}
      </div>

      <div className="mt-8 space-y-3">
        <label className="block text-xs font-medium text-(--text-secondary)">
          Search roles, users, policies
        </label>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, path segment, or full policy ARN…"
          className="w-full rounded-md border border-(--border) bg-(--bg-field) px-3 py-2 text-sm text-(--text-primary) outline-none focus:border-(--accent) focus:ring-1 focus:ring-(--accent)/30"
        />
        <p className="text-[11px] leading-relaxed text-(--text-muted)">
          <strong className="font-medium text-(--text-secondary)">
            Customer-managed
          </strong>{" "}
          policies appear from <code className="text-[10px]">ListPolicies</code>.
          <strong className="font-medium text-(--text-secondary)">
            {" "}
            Inline
          </strong>{" "}
          policies (attached to a role or user) are found by scanning
          roles/users (capped). Copying an inline policy creates a{" "}
          <strong className="font-medium text-(--text-secondary)">
            customer-managed
          </strong>{" "}
          policy with the same name on the target account.
        </p>
        <div className="flex flex-wrap gap-4 text-xs text-(--text-secondary)">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={includeRoles}
              onChange={(e) => setIncludeRoles(e.target.checked)}
              className="rounded border-(--border)"
            />
            Roles
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={includeUsers}
              onChange={(e) => setIncludeUsers(e.target.checked)}
              className="rounded border-(--border)"
            />
            Users
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={includePolicies}
              onChange={(e) => setIncludePolicies(e.target.checked)}
              className="rounded border-(--border)"
            />
            Customer-managed policies
          </label>
        </div>
        {searching ? (
          <p className="text-xs text-(--text-muted)">Searching…</p>
        ) : null}
        {searchError ? (
          <p className="text-xs text-(--danger)">{searchError}</p>
        ) : null}
        {truncated ? (
          <p className="text-xs text-(--text-muted)">
            Results may be truncated due to list limits. Refine your search.
          </p>
        ) : null}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-(--text-primary)">Results</h2>
        <ul className="mt-2 max-h-64 divide-y divide-(--border-hairline) overflow-y-auto rounded-lg border border-(--border-hairline) bg-(--bg-field)">
          {results.length === 0 && debouncedQuery.trim() && !searching ? (
            <li className="px-3 py-4 text-sm text-(--text-muted)">
              No matches.
            </li>
          ) : null}
          {results.map((hit) => {
            const active =
              selected?.arn === hit.arn && selected?.type === hit.type;
            return (
              <li key={`${hit.type}-${hit.arn}`}>
                <button
                  type="button"
                  onClick={() => setSelected(hit)}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm transition-colors ${
                    active
                      ? "bg-(--accent-muted) text-(--accent)"
                      : "hover:bg-(--bg-hover)"
                  }`}
                >
                  <span className="text-[11px] font-medium uppercase tracking-wide text-(--text-muted)">
                    {typeLabel(hit.type)}
                    {hit.inlineParent ? (
                      <span className="ml-1.5 font-(family-name:--font-mono) normal-case text-(--accent)">
                        · inline on {hit.inlineParent.kind}{" "}
                        {hit.inlineParent.name}
                      </span>
                    ) : null}
                  </span>
                  <span className="font-(family-name:--font-mono) text-[13px] text-(--text-primary)">
                    {hit.path === "/"
                      ? hit.name
                      : `${hit.path.replace(/\/$/, "")}/${hit.name}`}
                  </span>
                  <span className="max-w-full truncate text-xs text-(--text-muted)">
                    {hit.arn}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-8 space-y-3">
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-(--text-secondary)">
          <input
            type="checkbox"
            checked={deepCopy}
            onChange={(e) => setDeepCopy(e.target.checked)}
            className="mt-0.5 rounded border-(--border)"
          />
          <span>
            <span className="font-medium text-(--text-primary)">
              Deep copy
            </span>
            <span className="block text-[11px] leading-relaxed text-(--text-muted)">
              Users: copy IAM groups (and their policies) and add membership. Roles:
              copy tags, permissions boundary, and instance profile associations.
              Managed policies: also ensure roles, users, and groups that reference
              this policy exist on the target (shallow copy + attach; capped).
            </span>
          </span>
        </label>

        <label
          htmlFor="iam-copy-target"
          className="block text-xs font-medium text-(--text-secondary)"
        >
          Copy to profile
        </label>
        {namedProfiles.length === 0 ? (
          <p className="text-sm text-(--text-muted)">
            Add named profiles in{" "}
            <Link href="/settings" className="text-(--accent) hover:underline">
              Settings
            </Link>{" "}
            or{" "}
            <code className="text-xs">NEXT_PUBLIC_AWS_PROFILES</code> so you can
            select a target account.
          </p>
        ) : (
          <select
            id="iam-copy-target"
            value={targetProfile}
            onChange={(e) => setTargetProfile(e.target.value)}
            className={selectClass}
          >
            <option value="">Select target profile…</option>
            {namedProfiles.map((o) => (
              <option key={o.value} value={o.value}>
                {targetLabel(o.value)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleCopyClick}
          disabled={
            !selected ||
            !targetProfile.trim() ||
            copyLoading ||
            namedProfiles.length === 0
          }
          className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {copyLoading ? "Working…" : "Copy to target account"}
        </button>
        {copyMessage ? (
          <span className="text-sm text-(--text-secondary)">{copyMessage}</span>
        ) : null}
        {copyError ? (
          <span className="text-sm text-(--danger)">{copyError}</span>
        ) : null}
      </div>

      <OverwriteCopyDialog
        open={overwriteOpen}
        title="Entity already exists in target account"
        message="An IAM entity with the same name already exists in the target account. To replace it, confirm below. Trust policies and policy documents are rewritten to use the target account ID where possible."
        detail={pendingExistsDetail}
        overwrite={overwriteChecked}
        onOverwriteChange={setOverwriteChecked}
        onCancel={() => {
          setOverwriteOpen(false);
          setOverwriteChecked(false);
        }}
        onConfirm={() => runCopy(true)}
        loading={copyLoading}
        confirmLabel="Overwrite and copy"
      />
    </div>
  );
}
