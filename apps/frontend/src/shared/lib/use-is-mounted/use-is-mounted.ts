"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};
export const clientSnapshot = () => true;
export const serverSnapshot = () => false;

export function useIsMounted(): boolean {
  return useSyncExternalStore(emptySubscribe, clientSnapshot, serverSnapshot);
}
