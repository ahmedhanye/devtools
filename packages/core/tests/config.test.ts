import { describe, expect, it } from "bun:test";
import { type RuntimeConfig, RuntimeConfigSchema } from "../src/config";

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

  it("rejects empty host string", () => {
    expect(() => RuntimeConfigSchema.parse({ host: "" })).toThrow();
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
