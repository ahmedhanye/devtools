"use client";

import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;
const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/**
 * Subscribes to viewport mobile media query changes.
 *
 * @param callback - Listener invoked when the viewport crosses the mobile breakpoint.
 * @returns Cleanup function removing the media query listener.
 */
export function subscribeMobileMedia(callback: () => void): () => void {
  const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

/**
 * Reads the current client viewport mobile state from `window.matchMedia`.
 *
 * @returns `true` if the viewport width is below `768px`, `false` otherwise.
 */
export function getMobileSnapshot(): boolean {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

/**
 * Server-side fallback snapshot for `useIsMobile` during static prerendering.
 *
 * @returns Always `false` on the server.
 */
export function getServerMobileSnapshot(): boolean {
  return false;
}

/**
 * Tracks whether the browser viewport width is below the mobile breakpoint (`768px`).
 *
 * @remarks
 * Uses `useSyncExternalStore` bound to `window.matchMedia` to prevent post-mount
 * `useEffect` state cascades and maintain deterministic SSR hydration.
 *
 * @returns `true` on mobile viewports (`< 768px`), `false` on desktop or during SSR.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribeMobileMedia,
    getMobileSnapshot,
    getServerMobileSnapshot,
  );
}
