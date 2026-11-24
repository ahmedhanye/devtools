"use client";

import { useMemo, useSyncExternalStore } from "react";

const SEARCH_PARAMS_CHANGE_EVENT = "devtools:search-params-change";

/**
 * Dispatches a synthetic notification event so active {@link useNativeSearchParams}
 * hooks re-read `window.location.search` after programmatic history mutations.
 */
export function notifySearchParamsChange(): void {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function"
  ) {
    return;
  }
  window.dispatchEvent(new Event(SEARCH_PARAMS_CHANGE_EVENT));
}

/**
 * Updates `window.location.search` via `history.pushState` or `history.replaceState`
 * and notifies subscribed {@link useNativeSearchParams} consumers immediately.
 *
 * @param updater - Raw query string, `URLSearchParams`, or mutator callback.
 * @param options - Navigation options (`replace: true` replaces the current history entry).
 */
export function updateNativeSearchParams(
  updater: string | URLSearchParams | ((current: URLSearchParams) => void),
  options?: { replace?: boolean },
): void {
  if (typeof window === "undefined" || !window.location || !window.history) {
    return;
  }

  const url = new URL(window.location.href);
  if (typeof updater === "string") {
    const cleaned = updater.startsWith("?") ? updater.slice(1) : updater;
    url.search = cleaned ? `?${cleaned}` : "";
  } else if (updater instanceof URLSearchParams) {
    const serialized = updater.toString();
    url.search = serialized ? `?${serialized}` : "";
  } else {
    const next = new URLSearchParams(url.search);
    updater(next);
    const serialized = next.toString();
    url.search = serialized ? `?${serialized}` : "";
  }

  if (options?.replace) {
    window.history.replaceState(window.history.state, "", url.toString());
  } else {
    window.history.pushState(window.history.state, "", url.toString());
  }
  notifySearchParamsChange();
}

/**
 * Subscribes to browser `popstate` and programmatic search-param change events.
 *
 * @param callback - Listener invoked when URL search parameters change.
 * @returns Cleanup function removing registered listeners.
 */
export function subscribeToSearchParams(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.addEventListener) {
    return () => {};
  }
  window.addEventListener("popstate", callback);
  window.addEventListener(SEARCH_PARAMS_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(SEARCH_PARAMS_CHANGE_EVENT, callback);
  };
}

/**
 * Reads the current raw query string (`window.location.search`) on the client.
 *
 * @returns Raw search string from `window.location.search`, or `""` during SSR.
 */
export function getSearchParamsSnapshot(): string {
  if (typeof window === "undefined" || !window.location) {
    return "";
  }
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
 * Reads client URL search parameters via `useSyncExternalStore` (subscribing to `popstate`
 * and {@link updateNativeSearchParams} updates) to preserve Next.js static export (`output: "export"`)
 * prerendering without wrapping pages in top-level `<Suspense>` boundaries or triggering
 * `useEffect` state cascades.
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
