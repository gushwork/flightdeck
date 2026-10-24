"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import type { SecretEntry } from "@/lib/types";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";

interface DataContextValue {
  secrets: SecretEntry[];
  secretsLoading: boolean;
  secretsError: string | null;
  secretsFetchedAt: string | null;
  loadSecrets: () => Promise<void>;
  refreshSecrets: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

function buildListUrl(region: string, profile: string, force: boolean): string {
  const params = new URLSearchParams({ region });
  if (profile.trim()) params.set("profile", profile.trim());
  if (force) params.set("force", "1");
  return `/api/secrets/list?${params.toString()}`;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { region, profile } = useAwsWorkspace();
  const [secrets, setSecrets] = useState<SecretEntry[]>([]);
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [secretsError, setSecretsError] = useState<string | null>(null);
  const [secretsFetchedAt, setSecretsFetchedAt] = useState<string | null>(null);

  const lastLoadedWorkspaceRef = useRef<string | null>(null);
  /** Workspace of the in-flight request, if any. */
  const inFlightWorkspaceRef = useRef<string | null>(null);
  /** Monotonic request id — only the latest request may write state. */
  const requestIdRef = useRef(0);

  const fetchSecrets = useCallback(
    async (force: boolean) => {
      const workspaceKey = `${region}|${profile}`;
      // Dedupe only identical in-flight requests; a workspace switch supersedes the
      // old request instead of being dropped (which left stale-profile data showing).
      if (inFlightWorkspaceRef.current === workspaceKey) return;
      if (!force && lastLoadedWorkspaceRef.current === workspaceKey) return;
      const requestId = ++requestIdRef.current;
      inFlightWorkspaceRef.current = workspaceKey;
      setSecretsLoading(true);
      setSecretsError(null);
      try {
        const res = await fetch(buildListUrl(region, profile, force));
        const data = await res.json();
        if (requestIdRef.current !== requestId) return;
        if (data.error) throw new Error(data.error);
        setSecrets(data.secrets ?? []);
        setSecretsFetchedAt(new Date().toISOString());
        lastLoadedWorkspaceRef.current = workspaceKey;
      } catch (e) {
        if (requestIdRef.current !== requestId) return;
        setSecretsError(
          e instanceof Error ? e.message : "Failed to load secrets",
        );
      } finally {
        if (requestIdRef.current === requestId) {
          setSecretsLoading(false);
          inFlightWorkspaceRef.current = null;
        }
      }
    },
    [region, profile],
  );

  const loadSecrets = useCallback(() => fetchSecrets(false), [fetchSecrets]);
  const refreshSecrets = useCallback(() => fetchSecrets(true), [fetchSecrets]);

  useEffect(() => {
    lastLoadedWorkspaceRef.current = null;
    void loadSecrets();
  }, [region, profile, loadSecrets]);

  return (
    <DataContext.Provider
      value={{
        secrets,
        secretsLoading,
        secretsError,
        secretsFetchedAt,
        loadSecrets,
        refreshSecrets,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx)
    throw new Error("useData must be used within DataProvider");
  return ctx;
}
