"use client";

import { useState } from "react";
import { isValidHttpsBadgeUrl } from "@/lib/github/github-urls";

interface WorkflowBadgeImageProps {
  src: string | undefined | null;
  className?: string;
  alt?: string;
}

/**
 * Renders GitHub workflow status badge SVG; hides itself if URL is invalid or image fails to load.
 */
export function WorkflowBadgeImage({
  src,
  className = "h-5",
  alt = "Workflow status",
}: WorkflowBadgeImageProps) {
  const [hidden, setHidden] = useState(false);
  const safe = typeof src === "string" ? src.trim() : "";
  if (!isValidHttpsBadgeUrl(safe) || hidden) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote SVG badge from GitHub
    <img
      src={safe}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setHidden(true)}
    />
  );
}
