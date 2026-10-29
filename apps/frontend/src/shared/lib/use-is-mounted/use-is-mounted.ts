"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * Client-side snapshot returning `true` once hydrated in the browser.
 *
 * @returns Always `true` on the client.
 */
export const clientSnapshot = (): boolean => true;

/**
 * Server-side snapshot returning `false` during SSR and initial hydration.
 *
 * @returns Always `false` on the server.
 */
export const serverSnapshot = (): boolean => false;

/**
 * Hydration-safe hook indicating whether the component has mounted on the client.
 *
 * @remarks
 * Uses `useSyncExternalStore` instead of `useState` + `useEffect` to avoid
 * cascading state-in-effect renders while guaranteeing SSR/hydration parity.
 *
 * @returns `false` during server rendering and initial hydration, then `true` on the client.
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(emptySubscribe, clientSnapshot, serverSnapshot);
}
