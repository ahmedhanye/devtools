"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * Subscribes to browser `popstate` navigation events.
 *
 * @param callback - Listener invoked when browser history state changes.
 * @returns Cleanup function removing the `popstate` listener.
 */
export function subscribeToSearchParams(callback: () => void): () => void {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

/**
 * Reads the current raw query string (`window.location.search`) on the client.
 *
 * @returns Raw search string from `window.location.search`.
 */
export function getSearchParamsSnapshot(): string {
  return window.location.search;
}

/**
 * Server-side snapshot returning an empty query string during static prerendering.
 *
 * @returns Always `""` on the server.
 */
export function getServerSearchParamsSnapshot(): string {
  return "";
}

/**
 * Reads client URL search parameters via `useSyncExternalStore` (subscribing to `popstate` events)
 * to preserve Next.js static export (`output: "export"`) prerendering without wrapping pages
 * in top-level `<Suspense>` boundaries or triggering `useEffect` state cascades.
 *
 * @returns Memoized `URLSearchParams` instance reflecting `window.location.search`.
 */
export function useNativeSearchParams(): URLSearchParams {
  const rawSearch = useSyncExternalStore(
    subscribeToSearchParams,
    getSearchParamsSnapshot,
    getServerSearchParamsSnapshot,
  );
  return useMemo(() => new URLSearchParams(rawSearch), [rawSearch]);
}
