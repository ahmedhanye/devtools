import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const originalConsoleError = console.error;
console.error = (...args: unknown[]): void => {
  const first = args[0];
  if (
    first instanceof Error &&
    first.name === "DOMException" &&
    first.message.includes("iframe")
  ) {
    return;
  }
  originalConsoleError(...args);
};
