"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { AgentSidebar } from "@/components/agent/sidebar";
import { useData } from "@/lib/context/data-provider";
import { showAwsWorkspaceSelectors } from "@/lib/nav/aws-workspace-topbar";

function derivePageContext(pathname: string): {
  page: string;
  entityId: string | null;
} {
  if (pathname === "/") return { page: "dashboard", entityId: null };

  if (pathname === "/secrets")
    return { page: "secretsList", entityId: null };
  if (pathname === "/secrets/search")
    return { page: "secretsSearch", entityId: null };
  if (pathname === "/secrets/overview")
    return { page: "secretsOverview", entityId: null };
  if (
    pathname.startsWith("/secrets/") &&
    pathname.split("/").length > 2
  ) {
    return {
      page: "secretDetail",
      entityId: decodeURIComponent(pathname.split("/")[2]),
    };
  }

  if (pathname === "/analyzer" || pathname.startsWith("/analyzer/"))
    return { page: "analyzer", entityId: null };

  if (pathname === "/aws") return { page: "awsOverview", entityId: null };

  if (pathname.startsWith("/settings"))
    return { page: "settings", entityId: null };

  if (pathname === "/design-system")
    return { page: "designSystem", entityId: null };

  if (pathname === "/iam" || pathname.startsWith("/iam/"))
    return { page: "iam", entityId: null };

  if (pathname === "/github/overview")
    return { page: "githubOverview", entityId: null };

  if (pathname === "/github/secrets")
    return { page: "githubSecrets", entityId: null };

  if (pathname.startsWith("/github"))
    return { page: "github", entityId: null };

  if (pathname === "/fly/overview")
    return { page: "flyOverview", entityId: null };
  if (pathname === "/fly/secrets")
    return { page: "flySecrets", entityId: null };
  if (pathname.startsWith("/fly"))
    return { page: "fly", entityId: null };

  if (pathname === "/route53") return { page: "route53Hub", entityId: null };
  if (pathname === "/route53/fly-domains")
    return { page: "route53FlyDomains", entityId: null };
  if (pathname.startsWith("/route53"))
    return { page: "route53", entityId: null };

  return { page: "general", entityId: null };
}

function deriveBreadcrumb(pathname: string): string[] {
  if (pathname === "/") return ["Application dashboard"];
  const segments = pathname.split("/").filter(Boolean);
  return segments.map(
    (s) =>
      decodeURIComponent(s).charAt(0).toUpperCase() +
      decodeURIComponent(s).slice(1),
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { page, entityId } = derivePageContext(pathname);
  const { secrets } = useData();
  const [agentExpanded, setAgentExpanded] = useState(false);

  const breadcrumb = deriveBreadcrumb(pathname);
  const showWorkspaceSelectors = showAwsWorkspaceSelectors(pathname);

  const apiKeyConfigured =
    process.env.NEXT_PUBLIC_AGENT_ENABLED !== "false";

  // agent sidebar collapsed width: 300px; expanded width: min(520px, 40vw)
  const agentWidth = agentExpanded ? "w-[min(520px,40vw)]" : "w-[300px]";

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

        <aside
          className={`${agentWidth} shrink-0 border-l border-(--border-hairline) bg-(--bg-elevated) flex flex-col transition-[width] duration-200 ease-out`}
        >
          <AgentSidebar
            page={page}
            entityId={entityId}
            apiKeyConfigured={apiKeyConfigured}
            expanded={agentExpanded}
            onToggleExpand={() => setAgentExpanded((v) => !v)}
          />
        </aside>
      </div>
    </div>
  );
}
