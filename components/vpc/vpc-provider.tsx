"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import { workspaceSearchParams } from "@/lib/aws/workspace-query";
import type { VpcDetail, VpcOverviewResponse } from "@/lib/vpc/types";

interface VpcContextValue {
  region: string;
  vpcs: VpcDetail[];
  warnings: string[];
  pending: string[];
  /** True until the first response for the current region/profile arrives. */
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  updatedAt: number | null;
  refresh: () => Promise<void>;
}

const VpcContext = createContext<VpcContextValue | null>(null);

const STALE_AFTER_MS = 60_000;

/**
 * Holds the account-wide VPC fetch for /vpc and /vpc/[id] so moving between the list and a
 * detail page is instant (the layout stays mounted) and revalidates quietly in the background.
 */
export function VpcProvider({ children }: { children: ReactNode }) {
  const { region, profile } = useAwsWorkspace();
  const key = `${region}|${profile}`;
  const [data, setData] = useState<(VpcOverviewResponse & { key: string; at: number }) | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++latest.current;
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/vpc?${workspaceSearchParams(region, profile)}`);
      const body = await res.json();
      if (id !== latest.current) return;
      if (!res.ok) throw new Error(body.error ?? "Failed to load VPCs");
      setData({ ...(body as VpcOverviewResponse), key, at: Date.now() });
    } catch (e) {
      if (id === latest.current) setError(e instanceof Error ? e.message : "Failed to load VPCs");
    } finally {
      if (id === latest.current) setRefreshing(false);
    }
  }, [region, profile, key]);

  // Region/profile hydrate right after mount; waiting a beat skips a wasted first-region fetch.
  useEffect(() => {
    const t = setTimeout(() => void refresh(), 120);
    return () => clearTimeout(t);
  }, [refresh]);

  const current = data?.key === key ? data : null;
  const updatedAt = current?.at ?? null;
  const pendingCount = current?.pending?.length ?? 0;

  // Slow lookups finish server-side in the background; pick them up a few seconds later.
  useEffect(() => {
    if (!pendingCount) return;
    const t = setTimeout(() => void refresh(), 6000);
    return () => clearTimeout(t);
  }, [pendingCount, updatedAt, refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && updatedAt && Date.now() - updatedAt > STALE_AFTER_MS) {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh, updatedAt]);

  const value = useMemo<VpcContextValue>(
    () => ({
      region,
      vpcs: current?.vpcs ?? [],
      warnings: current?.warnings ?? [],
      pending: current?.pending ?? [],
      loading: !current && !error,
      refreshing,
      error,
      updatedAt,
      refresh,
    }),
    [region, current, error, refreshing, updatedAt, refresh],
  );

  return <VpcContext.Provider value={value}>{children}</VpcContext.Provider>;
}

export function useVpcs(): VpcContextValue {
  const ctx = useContext(VpcContext);
  if (!ctx) throw new Error("useVpcs must be used within VpcProvider");
  return ctx;
}
