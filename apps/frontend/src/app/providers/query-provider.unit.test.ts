import { createElement, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryProvider } from "./query-provider";

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryProvider, null, children);
}

describe("QueryProvider", () => {
  it("provides a QueryClient configured with the dashboard default query options", () => {
    const { result } = renderHook(() => useQueryClient(), { wrapper });
    const queryDefaults = result.current.getDefaultOptions().queries;

    expect(queryDefaults?.staleTime).toBe(10_000);
    expect(queryDefaults?.retry).toBe(1);
    expect(queryDefaults?.refetchOnWindowFocus).toBe(false);
  });

  it("preserves the same QueryClient instance across re-renders", () => {
    const { result, rerender } = renderHook(() => useQueryClient(), {
      wrapper,
    });
    const initialClient = result.current;

    rerender();

    expect(result.current).toBe(initialClient);
  });
});
