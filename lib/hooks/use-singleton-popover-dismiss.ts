"use client";

import { useEffect } from "react";

/**
 * When `openKey` is set, closes the popover on outside pointer-down or Escape.
 * Popover roots must set `data-popover-root` and `data-popover-key={openKey}` (same string)
 * on a wrapper that contains both the trigger and the floating panel.
 * Application-wide pattern for non-modal anchored popovers (avoid stacking multiple open).
 */
export function useSingletonPopoverDismiss(
  openKey: string | null,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (openKey === null) return;

    function onPointerDown(e: PointerEvent) {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const root = t.closest("[data-popover-root]");
      if (
        root instanceof HTMLElement &&
        typeof root.dataset.popoverKey === "string" &&
        root.dataset.popoverKey === openKey
      ) {
        return;
      }
      onDismiss();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onDismiss();
      }
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [openKey, onDismiss]);
}
