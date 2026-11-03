import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  getSearchParamsSnapshot,
  getServerSearchParamsSnapshot,
  subscribeToSearchParams,
  useNativeSearchParams,
} from "./use-native-search-params";

describe("useNativeSearchParams hook", () => {
  it("populates URLSearchParams from window.location.search via useSyncExternalStore", () => {
    const originalSearch = window.location.search;
    try {
      window.location.search = "?tab=overview&view=detail";
      const { result, unmount } = renderHook(() => useNativeSearchParams());
      expect(result.current.get("tab")).toBe("overview");
      expect(result.current.get("view")).toBe("detail");
      expect(getSearchParamsSnapshot()).toBe("?tab=overview&view=detail");
      expect(getServerSearchParamsSnapshot()).toBe("");
      unmount();
    } finally {
      window.location.search = originalSearch;
    }
  });

  it("subscribes and unsubscribes to popstate events", () => {
    let triggered = false;
    const unsubscribe = subscribeToSearchParams(() => {
      triggered = true;
    });
    window.dispatchEvent(new Event("popstate"));
    expect(triggered).toBe(true);
    unsubscribe();
  });

  it("safely falls back during SSR or when window globals are unavailable", () => {
    const originalAddEventListener = window.addEventListener;
    const originalLocation = window.location;
    try {
      // @ts-expect-error simulating SSR
      delete window.addEventListener;
      // @ts-expect-error simulating SSR
      delete window.location;
      expect(getSearchParamsSnapshot()).toBe("");
      const unsubscribe = subscribeToSearchParams(() => {});
      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    } finally {
      window.addEventListener = originalAddEventListener;
      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
        configurable: true,
      });
    }
  });
});
