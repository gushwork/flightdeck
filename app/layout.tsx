import type { Metadata } from "next";
import { DM_Sans, Fraunces, IBM_Plex_Mono } from "next/font/google";
import { Shell } from "@/components/layout/shell";
import { AwsWorkspaceProvider } from "@/lib/context/aws-workspace-provider";
import { DataProvider } from "@/lib/context/data-provider";
import { GithubDataProvider } from "@/lib/context/github-data-provider";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "Flightdeck",
  description: "AWS and GitHub operations console — Secrets, Actions, IAM, and more",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${dmSans.variable} ${ibmPlexMono.variable}`}
    >
      <body className="min-h-screen overflow-hidden antialiased">
        <AwsWorkspaceProvider>
          <DataProvider>
            <GithubDataProvider>
              <Shell>{children}</Shell>
            </GithubDataProvider>
          </DataProvider>
        </AwsWorkspaceProvider>
      </body>
    </html>
  );
}
