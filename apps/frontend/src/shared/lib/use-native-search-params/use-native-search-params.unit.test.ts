import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  getSearchParamsSnapshot,
  getServerSearchParamsSnapshot,
  notifySearchParamsChange,
  subscribeToSearchParams,
  updateNativeSearchParams,
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

  it("subscribes and unsubscribes to popstate and programmatic search-param events cleanly", () => {
    let callCount = 0;
    const unsubscribe = subscribeToSearchParams(() => {
      callCount += 1;
    });
    window.dispatchEvent(new Event("popstate"));
    notifySearchParamsChange();
    expect(callCount).toBe(2);

    unsubscribe();
    window.dispatchEvent(new Event("popstate"));
    notifySearchParamsChange();
    expect(callCount).toBe(2);
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

  it("re-renders useNativeSearchParams reactively on updateNativeSearchParams and notifySearchParamsChange", () => {
    const originalHref = window.location.href;
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceSpy = vi.spyOn(window.history, "replaceState");

    try {
      window.history.replaceState({}, "", "/lighthouse/run?job=job-1");
      const { result, unmount } = renderHook(() => useNativeSearchParams());
      expect(result.current.get("job")).toBe("job-1");

      act(() => {
        updateNativeSearchParams(
          (params) => {
            params.delete("job");
            params.set("id", "run-42");
            params.set("tab", "report");
          },
          { replace: true },
        );
      });

      expect(replaceSpy).toHaveBeenCalled();
      expect(result.current.get("job")).toBeNull();
      expect(result.current.get("id")).toBe("run-42");
      expect(result.current.get("tab")).toBe("report");

      act(() => {
        updateNativeSearchParams(new URLSearchParams("runs=r1,r2"));
      });
      expect(pushSpy).toHaveBeenCalled();
      expect(result.current.get("runs")).toBe("r1,r2");

      act(() => {
        updateNativeSearchParams("id=run-99&tab=summary", { replace: true });
      });
      expect(result.current.get("id")).toBe("run-99");

      act(() => {
        updateNativeSearchParams("?id=run-100&tab=report", { replace: true });
      });
      expect(result.current.get("id")).toBe("run-100");
      expect(result.current.get("tab")).toBe("report");

      act(() => {
        updateNativeSearchParams("", { replace: true });
      });
      expect(result.current.toString()).toBe("");

      act(() => {
        updateNativeSearchParams(new URLSearchParams("foo=bar"));
      });
      expect(result.current.get("foo")).toBe("bar");

      act(() => {
        updateNativeSearchParams(new URLSearchParams(), { replace: true });
      });
      expect(result.current.toString()).toBe("");

      act(() => {
        updateNativeSearchParams("last=1", { replace: true });
      });
      expect(result.current.get("last")).toBe("1");

      act(() => {
        updateNativeSearchParams(
          (params) => {
            params.delete("last");
          },
          { replace: true },
        );
      });
      expect(result.current.toString()).toBe("");

      window.history.replaceState({}, "", "/lighthouse?tab=history");
      act(() => {
        notifySearchParamsChange();
      });
      expect(result.current.get("tab")).toBe("history");

      unmount();
      act(() => {
        updateNativeSearchParams("after=unmount", { replace: true });
      });
      expect(result.current.get("tab")).toBe("history");
      expect(result.current.get("after")).toBeNull();
    } finally {
      pushSpy.mockRestore();
      replaceSpy.mockRestore();
      window.history.replaceState({}, "", originalHref);
    }
  });

  it("preserves existing window.history.state on pushState and replaceState", () => {
    const originalHref = window.location.href;
    const originalState: unknown = window.history.state;
    const sentinelState = { __NA: true, tree: ["lighthouse"] };

    try {
      window.history.replaceState(
        sentinelState,
        "",
        "/lighthouse/run?job=job-1",
      );
      updateNativeSearchParams("id=run-1", { replace: true });
      expect(window.history.state).toEqual(sentinelState);

      updateNativeSearchParams("id=run-2");
      expect(window.history.state).toEqual(sentinelState);
    } finally {
      window.history.replaceState(originalState, "", originalHref);
    }
  });

  it("no-ops updateNativeSearchParams and notifySearchParamsChange when window globals are absent", () => {
    const originalHistory = window.history;
    const originalDispatch = window.dispatchEvent;
    try {
      // @ts-expect-error simulating SSR
      delete window.history;
      // @ts-expect-error simulating SSR
      delete window.dispatchEvent;
      expect(() => updateNativeSearchParams("id=1")).not.toThrow();
      expect(() => notifySearchParamsChange()).not.toThrow();
    } finally {
      Object.defineProperty(window, "history", {
        value: originalHistory,
        writable: true,
        configurable: true,
      });
      window.dispatchEvent = originalDispatch;
    }
  });
});
