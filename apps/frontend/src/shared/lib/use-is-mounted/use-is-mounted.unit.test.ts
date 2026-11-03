import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clientSnapshot, serverSnapshot, useIsMounted } from "./use-is-mounted";

describe("useIsMounted hook", () => {
  it("returns true when mounted in client environment", () => {
    const { result } = renderHook(() => useIsMounted());
    expect(result.current).toBe(true);
  });

  it("provides deterministic snapshots for client and server environments", () => {
    expect(clientSnapshot()).toBe(true);
    expect(serverSnapshot()).toBe(false);
  });
});
