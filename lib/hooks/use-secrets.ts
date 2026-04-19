"use client";

import { useState, useEffect, useCallback } from "react";
import type { SecretEntry } from "@/lib/types";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import { workspaceSearchParams } from "@/lib/aws/workspace-query";

export function useSecrets() {
  const { region, profile } = useAwsWorkspace();
  const [secrets, setSecrets] = useState<SecretEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = workspaceSearchParams(region, profile).toString();
      const res = await fetch(`/api/secrets/list?${q}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSecrets(data.secrets);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load secrets");
    } finally {
      setLoading(false);
    }
  }, [region, profile]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { secrets, loading, error, refresh: fetchData };
}
