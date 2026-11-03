import { describe, expect, test } from "bun:test";
import {
  formatError,
  isLoopbackHostHeader,
  isLoopbackOrigin,
} from "../src/middleware/security";

describe("Security Middleware Helpers (Unit)", () => {
  describe("isLoopbackHostHeader", () => {
    test("returns false for non-string, null, empty, or whitespace values", () => {
      expect(isLoopbackHostHeader(null as unknown as string)).toBe(false);
      expect(isLoopbackHostHeader(undefined as unknown as string)).toBe(false);
      expect(isLoopbackHostHeader("")).toBe(false);
      expect(isLoopbackHostHeader("   ")).toBe(false);
    });

    test("validates IPv6 bracketed hostnames", () => {
      expect(isLoopbackHostHeader("[::1]:4000")).toBe(true);
      expect(isLoopbackHostHeader("[::1]")).toBe(true);
      expect(isLoopbackHostHeader("[::1]:1")).toBe(true);
      expect(isLoopbackHostHeader("[::1]:65535")).toBe(true);
      expect(isLoopbackHostHeader("[::1]:evil")).toBe(false);
      expect(isLoopbackHostHeader("[::1]:0")).toBe(false);
      expect(isLoopbackHostHeader("[::1]:65536")).toBe(false);
      expect(isLoopbackHostHeader("[::1]:-1")).toBe(false);
      expect(isLoopbackHostHeader("[::1")).toBe(false);
      expect(isLoopbackHostHeader("[::1]extra")).toBe(false);
      expect(isLoopbackHostHeader("[2001:db8::1]:4000")).toBe(false);
    });

    test("validates IPv4 and localhost hostnames with and without ports", () => {
      expect(isLoopbackHostHeader("localhost:4000")).toBe(true);
      expect(isLoopbackHostHeader("localhost")).toBe(true);
      expect(isLoopbackHostHeader("localhost:1")).toBe(true);
      expect(isLoopbackHostHeader("localhost:65535")).toBe(true);
      expect(isLoopbackHostHeader("localhost:evil")).toBe(false);
      expect(isLoopbackHostHeader("localhost:0")).toBe(false);
      expect(isLoopbackHostHeader("localhost:65536")).toBe(false);
      expect(isLoopbackHostHeader("localhost:")).toBe(false);
      expect(isLoopbackHostHeader("127.0.0.1:4000")).toBe(true);
      expect(isLoopbackHostHeader("127.0.0.1")).toBe(true);
      expect(isLoopbackHostHeader("127.0.0.1:evil")).toBe(false);
      expect(isLoopbackHostHeader("127.0.0.1:0")).toBe(false);
      expect(isLoopbackHostHeader("127.0.0.1:65536")).toBe(false);
      expect(isLoopbackHostHeader("::1")).toBe(true);
      expect(isLoopbackHostHeader("::1:4000")).toBe(false);
      expect(isLoopbackHostHeader("evil.example.com:4000")).toBe(false);
      expect(isLoopbackHostHeader("192.168.1.100")).toBe(false);
    });
  });

  describe("isLoopbackOrigin", () => {
    test("validates loopback origins", () => {
      expect(isLoopbackOrigin("http://localhost:4000")).toBe(true);
      expect(isLoopbackOrigin("http://127.0.0.1:3000")).toBe(true);
      expect(isLoopbackOrigin("http://[::1]:5000")).toBe(true);
      expect(isLoopbackOrigin("https://localhost:4000")).toBe(true);
    });

    test("rejects non-loopback origins and malformed URLs", () => {
      expect(isLoopbackOrigin("http://evil.com")).toBe(false);
      expect(isLoopbackOrigin("ftp://localhost")).toBe(false);
      expect(isLoopbackOrigin("not-a-url")).toBe(false);
    });
  });

  describe("formatError", () => {
    test("formats standard error response without details", () => {
      const res = formatError("NOT_FOUND", "Resource not found");
      expect(res).toEqual({
        error: {
          code: "NOT_FOUND",
          message: "Resource not found",
        },
      });
    });

    test("formats standard error response with structured details", () => {
      const details = { field: "username", reason: "required" };
      const res = formatError("VALIDATION_ERROR", "Invalid input", details);
      expect(res).toEqual({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details,
        },
      });
    });

    test("rejects invalid payload failing ApiErrorResponseSchema", () => {
      expect(() => formatError("", "Empty code")).toThrow();
      expect(() => formatError("INVALID", "")).toThrow();
    });
  });
});
