"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { useData } from "@/lib/context/data-provider";
import { showAwsWorkspaceSelectors } from "@/lib/nav/aws-workspace-topbar";

function deriveBreadcrumb(pathname: string): string[] {
  if (pathname === "/") return ["Needs attention"];
  const segments = pathname.split("/").filter(Boolean);
  return segments.map(
    (s) =>
      decodeURIComponent(s).charAt(0).toUpperCase() +
      decodeURIComponent(s).slice(1),
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { secrets } = useData();

  const breadcrumb = deriveBreadcrumb(pathname);
  const showWorkspaceSelectors = showAwsWorkspaceSelectors(pathname);

  return (
    <div className="flex h-screen flex-col bg-(--bg-deep)">
      <Topbar
        items={breadcrumb}
        showWorkspaceSelectors={showWorkspaceSelectors}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* sidebar nav width */}
        <aside className="w-[232px] shrink-0 border-r border-(--border-hairline) bg-(--bg-elevated)">
          <Sidebar secretsCount={secrets.length} />
        </aside>

        <main className="flex-1 overflow-y-auto bg-(--bg-deep) px-8 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
