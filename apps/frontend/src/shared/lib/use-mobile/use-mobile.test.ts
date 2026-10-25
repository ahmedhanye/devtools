import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  getMobileSnapshot,
  getServerMobileSnapshot,
  subscribeMobileMedia,
  useIsMobile,
} from "./use-mobile";

describe("useIsMobile", () => {
  it("returns true when viewport width is below mobile breakpoint", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener,
      removeEventListener,
      dispatchEvent: vi.fn(),
    }));
    window.innerWidth = 500;

    const { result, unmount } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    expect(addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });

  it("returns false when viewport width is at or above mobile breakpoint", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    window.innerWidth = 1024;

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    expect(getMobileSnapshot()).toBe(false);
    expect(getServerMobileSnapshot()).toBe(false);
  });

  it("subscribes and unsubscribes via subscribeMobileMedia", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener,
      removeEventListener,
    });
    const cb = vi.fn();
    const unsubscribe = subscribeMobileMedia(cb);
    expect(addEventListener).toHaveBeenCalledWith("change", cb);
    unsubscribe();
    expect(removeEventListener).toHaveBeenCalledWith("change", cb);
  });
});
