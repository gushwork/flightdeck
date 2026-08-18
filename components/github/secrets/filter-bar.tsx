"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import type {
  GHSecretKind,
  GHSecretPlatform,
  GHSecretScope,
} from "@/lib/github/secrets-types";

const SCOPES: GHSecretScope[] = ["organization", "repository", "environment", "codespaces_user"];
const PLATFORMS: GHSecretPlatform[] = ["actions", "dependabot", "codespaces"];
const KINDS: GHSecretKind[] = ["secret", "variable"];
const DEBOUNCE_MS = 300;

function useDebouncedUrlSync() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateImmediate = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`/github/secrets?${params.toString()}`, { scroll: false });
  };

  const updateDebounced = (key: string, value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateImmediate(key, value), DEBOUNCE_MS);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { updateImmediate, updateDebounced };
}

export function SecretsFilterBar() {
  const searchParams = useSearchParams();
  const { updateImmediate, updateDebounced } = useDebouncedUrlSync();

  const inputClass =
    "rounded-lg border border-(--border) bg-(--bg-field) px-2.5 py-1.5 text-xs text-(--text-primary) outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20";

  const qKey = searchParams.get("q") ?? "";
  const ownerKey = searchParams.get("owner") ?? "";
  const repoKey = searchParams.get("repo") ?? "";

  return (
    <div className="sticky top-0 z-10 -mx-8 flex flex-wrap items-center gap-3 border-b border-(--border-hairline) bg-(--bg-deep)/90 px-8 py-3 backdrop-blur-sm">
      <input
        key={`q-${qKey}`}
        type="search"
        placeholder="Search name, repo…"
        defaultValue={qKey}
        onChange={(e) => updateDebounced("q", e.target.value)}
        className={`min-w-[200px] flex-1 ${inputClass}`}
      />
      <select
        value={searchParams.get("kind") ?? ""}
        onChange={(e) => updateImmediate("kind", e.target.value)}
        className={inputClass}
      >
        <option value="">All kinds</option>
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <select
        value={searchParams.get("scope") ?? ""}
        onChange={(e) => updateImmediate("scope", e.target.value)}
        className={inputClass}
      >
        <option value="">All scopes</option>
        {SCOPES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        value={searchParams.get("platform") ?? ""}
        onChange={(e) => updateImmediate("platform", e.target.value)}
        className={inputClass}
      >
        <option value="">All platforms</option>
        {PLATFORMS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <input
        key={`owner-${ownerKey}`}
        type="text"
        placeholder="Owner"
        defaultValue={ownerKey}
        onChange={(e) => updateDebounced("owner", e.target.value)}
        className={`w-28 ${inputClass}`}
      />
      <input
        key={`repo-${repoKey}`}
        type="text"
        placeholder="Repo (owner/name)"
        defaultValue={repoKey}
        onChange={(e) => updateDebounced("repo", e.target.value)}
        className={`min-w-[160px] ${inputClass}`}
      />
    </div>
  );
}
