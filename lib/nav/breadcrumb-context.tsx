"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface BreadcrumbItem {
  label: string;
  /** Present on clickable crumbs; the last crumb is never a link. */
  href?: string;
}

interface BreadcrumbContextValue {
  items: BreadcrumbItem[] | null;
  setItems: (items: BreadcrumbItem[] | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  items: null,
  setItems: () => {},
});

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BreadcrumbItem[] | null>(null);
  const value = useMemo(() => ({ items, setItems }), [items]);
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

/** Breadcrumbs a page has claimed for the top bar, or null to use the path-derived ones. */
export function useBreadcrumbOverride(): BreadcrumbItem[] | null {
  return useContext(BreadcrumbContext).items;
}

/** Lets a page replace the top-bar breadcrumbs while mounted (e.g. VPC → name → view). */
export function useBreadcrumbs(items: BreadcrumbItem[]): void {
  const { setItems } = useContext(BreadcrumbContext);
  const key = JSON.stringify(items);
  useEffect(() => {
    setItems(JSON.parse(key) as BreadcrumbItem[]);
    return () => setItems(null);
  }, [key, setItems]);
}
