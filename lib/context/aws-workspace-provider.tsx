"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  startTransition,
} from "react";

const REGION_KEY = "aws-region";
const PROFILE_KEY = "aws-profile";

/** Comma-separated profile names saved in the browser (merged with env). */
export const AWS_SAVED_PROFILES_KEY = "aws-saved-profiles";

export const AWS_PROFILE_LIST_CHANGED = "aws-profile-list-changed";

export interface ProfileOption {
  label: string;
  value: string;
}

function parseEnvProfileNames(): string[] {
  const raw = process.env.NEXT_PUBLIC_AWS_PROFILES ?? "";
  const names = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const n of names) {
    if (seen.has(n)) continue;
    seen.add(n);
    unique.push(n);
  }
  return unique;
}

function readSavedProfileNamesFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(AWS_SAVED_PROFILES_KEY) ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function notifyAwsProfileListChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AWS_PROFILE_LIST_CHANGED));
}

interface AwsWorkspaceContextValue {
  region: string;
  setRegion: (r: string) => void;
  profile: string;
  setProfile: (p: string) => void;
  profileOptions: ProfileOption[];
}

const AwsWorkspaceContext = createContext<AwsWorkspaceContextValue | null>(
  null,
);

function mergeEnvAndSavedProfileOptions(
  savedNames: string[],
): ProfileOption[] {
  const envNames = parseEnvProfileNames();
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const n of [...envNames, ...savedNames]) {
    if (seen.has(n)) continue;
    seen.add(n);
    ordered.push(n);
  }
  return [
    { label: "Default", value: "" },
    ...ordered.map((value) => ({ label: value, value })),
  ];
}

export function AwsWorkspaceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [region, setRegionState] = useState("us-east-1");
  const [profile, setProfileState] = useState("");
  /** Empty until mount so SSR and the first client render match (no localStorage in markup). */
  const [savedProfileNames, setSavedProfileNames] = useState<string[]>([]);

  const profileOptions = useMemo(
    () => mergeEnvAndSavedProfileOptions(savedProfileNames),
    [savedProfileNames],
  );

  const bumpProfileList = useCallback(() => {
    setSavedProfileNames(readSavedProfileNamesFromStorage());
  }, []);

  useEffect(() => {
    startTransition(() => {
      setSavedProfileNames(readSavedProfileNamesFromStorage());
      setRegionState(
        () => localStorage.getItem(REGION_KEY) || "us-east-1",
      );
      setProfileState(() => localStorage.getItem(PROFILE_KEY) ?? "");
    });
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === REGION_KEY) {
        setRegionState(e.newValue ?? "us-east-1");
      }
      if (e.key === PROFILE_KEY) {
        setProfileState(e.newValue ?? "");
      }
      if (e.key === AWS_SAVED_PROFILES_KEY) {
        bumpProfileList();
      }
    };
    const onProfileListChanged = () => bumpProfileList();
    window.addEventListener("storage", onStorage);
    window.addEventListener(AWS_PROFILE_LIST_CHANGED, onProfileListChanged);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(AWS_PROFILE_LIST_CHANGED, onProfileListChanged);
    };
  }, [bumpProfileList]);

  const setRegion = useCallback((r: string) => {
    setRegionState(r);
    localStorage.setItem(REGION_KEY, r);
  }, []);

  const setProfile = useCallback((p: string) => {
    setProfileState(p);
    localStorage.setItem(PROFILE_KEY, p);
  }, []);

  const value = useMemo(
    () => ({
      region,
      setRegion,
      profile,
      setProfile,
      profileOptions,
    }),
    [region, setRegion, profile, setProfile, profileOptions],
  );

  return (
    <AwsWorkspaceContext.Provider value={value}>
      {children}
    </AwsWorkspaceContext.Provider>
  );
}

export function useAwsWorkspace(): AwsWorkspaceContextValue {
  const ctx = useContext(AwsWorkspaceContext);
  if (!ctx) {
    throw new Error("useAwsWorkspace must be used within AwsWorkspaceProvider");
  }
  return ctx;
}
