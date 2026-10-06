import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useNativeSearchParams } from "./use-native-search-params";

describe("useNativeSearchParams hook", () => {
  it("initializes with empty URLSearchParams and populates from window.location.search", () => {
    const originalSearch = window.location.search;
    try {
      window.location.search = "?tab=overview&view=detail";
      const { result } = renderHook(() => useNativeSearchParams());
      expect(result.current.get("tab")).toBe("overview");
      expect(result.current.get("view")).toBe("detail");
    } finally {
      window.location.search = originalSearch;
    }
  });
});
