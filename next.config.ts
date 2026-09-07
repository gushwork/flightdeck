import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Electron and local tooling load the app at 127.0.0.1, not localhost.
  allowedDevOrigins: ["127.0.0.1"],
  // Keep repo AGENTS.md / CLAUDE.md as the source of truth.
  agentRules: false,
};

export default nextConfig;
