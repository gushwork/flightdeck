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
  const secretsLoadingRef = useRef(false);

  const loadSecrets = useCallback(async () => {
    const workspaceKey = `${region}|${profile}`;
    if (secretsLoadingRef.current) return;
    if (lastLoadedWorkspaceRef.current === workspaceKey) return;
    secretsLoadingRef.current = true;
    setSecretsLoading(true);
    setSecretsError(null);
    try {
      const res = await fetch(buildListUrl(region, profile, false));
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSecrets(data.secrets);
      setSecretsFetchedAt(new Date().toISOString());
      lastLoadedWorkspaceRef.current = workspaceKey;
    } catch (e) {
      setSecretsError(
        e instanceof Error ? e.message : "Failed to load secrets",
      );
    } finally {
      setSecretsLoading(false);
      secretsLoadingRef.current = false;
    }
  }, [region, profile]);

  const refreshSecrets = useCallback(async () => {
    const workspaceKey = `${region}|${profile}`;
    if (secretsLoadingRef.current) return;
    secretsLoadingRef.current = true;
    setSecretsLoading(true);
    setSecretsError(null);
    try {
      const res = await fetch(buildListUrl(region, profile, true));
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSecrets(data.secrets);
      setSecretsFetchedAt(new Date().toISOString());
      lastLoadedWorkspaceRef.current = workspaceKey;
    } catch (e) {
      setSecretsError(
        e instanceof Error ? e.message : "Failed to load secrets",
      );
    } finally {
      setSecretsLoading(false);
      secretsLoadingRef.current = false;
    }
  }, [region, profile]);

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
