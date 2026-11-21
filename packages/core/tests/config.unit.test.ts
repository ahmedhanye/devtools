import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  type RuntimeConfig,
  RuntimeConfigError,
  RuntimeConfigSchema,
  formatRuntimeConfigError,
  parsePortFromEnv,
} from "../src/config";

describe("RuntimeConfigSchema", () => {
  it("resolves default values when parsed with an empty object", () => {
    const config = RuntimeConfigSchema.parse({});
    expect(config).toEqual({
      host: "127.0.0.1",
      port: 4000,
    });
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(4000);
    expect(config.staticDir).toBeUndefined();
  });

  it("accepts valid explicit configurations", () => {
    const customConfig: RuntimeConfig = {
      host: "0.0.0.0",
      port: 8080,
      staticDir: "./public",
    };
    const parsed = RuntimeConfigSchema.parse(customConfig);
    expect(parsed).toEqual(customConfig);
  });

  it("accepts port boundaries at 0 and 65535", () => {
    expect(RuntimeConfigSchema.parse({ port: 0 }).port).toBe(0);
    expect(RuntimeConfigSchema.parse({ port: 65535 }).port).toBe(65535);
  });

  it("rejects port numbers outside valid 0-65535 range", () => {
    expect(() => RuntimeConfigSchema.parse({ port: -1 })).toThrow();
    expect(() => RuntimeConfigSchema.parse({ port: 65536 })).toThrow();
    expect(() => RuntimeConfigSchema.parse({ port: 100000 })).toThrow();
  });

  it("rejects non-integer ports", () => {
    expect(() => RuntimeConfigSchema.parse({ port: 3000.5 })).toThrow();
    expect(() => RuntimeConfigSchema.parse({ port: "4000" })).toThrow();
  });

  it("rejects empty or whitespace-only host and staticDir strings", () => {
    expect(() => RuntimeConfigSchema.parse({ host: "" })).toThrow();
    expect(() => RuntimeConfigSchema.parse({ host: "   " })).toThrow();
    expect(() => RuntimeConfigSchema.parse({ staticDir: "" })).toThrow();
    expect(() => RuntimeConfigSchema.parse({ staticDir: "   " })).toThrow();
  });

  it("rejects unexpected extraneous keys due to strict validation", () => {
    expect(() =>
      RuntimeConfigSchema.parse({
        host: "127.0.0.1",
        port: 4000,
        extraParam: "forbidden",
      }),
    ).toThrow();
  });
});

describe("parsePortFromEnv", () => {
  it("returns undefined when portStr is undefined", () => {
    expect(parsePortFromEnv(undefined)).toBeUndefined();
    expect(parsePortFromEnv()).toBeUndefined();
  });

  it("parses valid integer strings", () => {
    expect(parsePortFromEnv("0")).toBe(0);
    expect(parsePortFromEnv("3000")).toBe(3000);
    expect(parsePortFromEnv("65535")).toBe(65535);
    expect(parsePortFromEnv("99999")).toBe(99999);
  });

  it("trims whitespace from port strings", () => {
    expect(parsePortFromEnv("  4000  ")).toBe(4000);
    expect(parsePortFromEnv("\t8080\n")).toBe(8080);
  });

  it("parses negative integer strings", () => {
    expect(parsePortFromEnv("-1")).toBe(-1);
    expect(parsePortFromEnv(" -500 ")).toBe(-500);
  });

  it("returns NaN for decimal, non-numeric, or mixed strings", () => {
    expect(parsePortFromEnv("3000.5")).toBeNaN();
    expect(parsePortFromEnv("abc")).toBeNaN();
    expect(parsePortFromEnv("4000abc")).toBeNaN();
    expect(parsePortFromEnv("12e3")).toBeNaN();
    expect(parsePortFromEnv("0x10")).toBeNaN();
  });

  it("returns NaN for empty or whitespace-only strings", () => {
    expect(parsePortFromEnv("")).toBeNaN();
    expect(parsePortFromEnv("   ")).toBeNaN();
  });
});

describe("formatRuntimeConfigError", () => {
  it("formats port override and PORT env errors clearly", () => {
    const portRes = RuntimeConfigSchema.safeParse({ port: -1 });
    expect(portRes.success).toBe(false);
    if (!portRes.success) {
      const overrideErr = formatRuntimeConfigError(portRes.error, {
        portOverride: -1,
      });
      expect(overrideErr).toBeInstanceOf(RuntimeConfigError);
      expect(overrideErr.name).toBe("RuntimeConfigError");
      expect(overrideErr.message).toBe(
        'Invalid port number "-1": must be an integer between 0 and 65535',
      );
      expect(overrideErr.cause).toBe(portRes.error);

      const envErr = formatRuntimeConfigError(portRes.error, {
        envPort: "4000abc",
      });
      expect(envErr.message).toBe(
        'Invalid environment variable PORT="4000abc": must be an integer between 0 and 65535',
      );
    }
  });

  it("formats host override and HOST env errors with explicit source labels", () => {
    const hostRes = RuntimeConfigSchema.safeParse({ host: "" });
    expect(hostRes.success).toBe(false);
    if (!hostRes.success) {
      const defaultHostErr = formatRuntimeConfigError(hostRes.error, {
        hostOverride: "",
      });
      expect(defaultHostErr.message).toBe(
        'Invalid host "": must be a non-empty hostname or IP address',
      );

      const cliHostErr = formatRuntimeConfigError(hostRes.error, {
        hostOverride: "",
        hostOptionLabel: "--host",
      });
      expect(cliHostErr.message).toBe(
        'Invalid --host "": must be a non-empty hostname or IP address',
      );

      const envHostErr = formatRuntimeConfigError(hostRes.error, {
        envHost: "",
      });
      expect(envHostErr.message).toBe(
        'Invalid environment variable HOST="": must be a non-empty hostname or IP address',
      );
    }
  });

  it("falls back to first issue or fallback message for other schema errors", () => {
    const strictRes = RuntimeConfigSchema.safeParse({ extra: "nope" });
    expect(strictRes.success).toBe(false);
    if (!strictRes.success) {
      const strictErr = formatRuntimeConfigError(strictRes.error);
      expect(strictErr).toBeInstanceOf(RuntimeConfigError);
      expect(strictErr.message).toContain("extra");
    }

    const emptyError = new z.ZodError([]);
    expect(
      formatRuntimeConfigError(emptyError, {
        fallbackMessage: "Custom fallback",
      }).message,
    ).toBe("Custom fallback");
    expect(formatRuntimeConfigError(emptyError).message).toBe(
      "Invalid runtime configuration",
    );
  });
});
