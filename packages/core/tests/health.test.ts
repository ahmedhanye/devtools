import { describe, expect, it } from "bun:test";
import {
  type HealthResponse,
  HealthResponseSchema,
  type HealthStatus,
  HealthStatusSchema,
} from "../src/health";

describe("HealthStatusSchema", () => {
  it("accepts valid status values", () => {
    expect(HealthStatusSchema.parse("ok")).toBe("ok");
    expect(HealthStatusSchema.parse("degraded")).toBe("degraded");
    expect(HealthStatusSchema.parse("error")).toBe("error");
  });

  it("rejects invalid status values", () => {
    expect(() => HealthStatusSchema.parse("healthy")).toThrow();
    expect(() => HealthStatusSchema.parse("down")).toThrow();
    expect(() => HealthStatusSchema.parse("")).toThrow();
    expect(() => HealthStatusSchema.parse(123)).toThrow();
  });
});

describe("HealthResponseSchema", () => {
  const validPayload: HealthResponse = {
    status: "ok",
    timestamp: "2026-09-30T12:00:00.000Z",
    uptime: 123.45,
    version: "0.1.0",
  };

  it("accepts valid health response payloads", () => {
    const parsed = HealthResponseSchema.parse(validPayload);
    expect(parsed).toEqual(validPayload);

    const degradedPayload = {
      ...validPayload,
      status: "degraded" as HealthStatus,
    };
    expect(HealthResponseSchema.parse(degradedPayload).status).toBe("degraded");

    const errorPayload = { ...validPayload, status: "error" as HealthStatus };
    expect(HealthResponseSchema.parse(errorPayload).status).toBe("error");
  });

  it("rejects invalid timestamps", () => {
    expect(() =>
      HealthResponseSchema.parse({
        ...validPayload,
        timestamp: "not-a-timestamp",
      }),
    ).toThrow();

    expect(() =>
      HealthResponseSchema.parse({
        ...validPayload,
        timestamp: "2026-09-30",
      }),
    ).toThrow();
  });

  it("rejects negative uptimes", () => {
    expect(() =>
      HealthResponseSchema.parse({
        ...validPayload,
        uptime: -1,
      }),
    ).toThrow();
  });

  it("rejects empty version strings", () => {
    expect(() =>
      HealthResponseSchema.parse({
        ...validPayload,
        version: "",
      }),
    ).toThrow();
  });

  it("rejects missing required fields", () => {
    const { status: _status, ...missingStatus } = validPayload;
    expect(() => HealthResponseSchema.parse(missingStatus)).toThrow();

    const { timestamp: _timestamp, ...missingTimestamp } = validPayload;
    expect(() => HealthResponseSchema.parse(missingTimestamp)).toThrow();

    const { uptime: _uptime, ...missingUptime } = validPayload;
    expect(() => HealthResponseSchema.parse(missingUptime)).toThrow();

    const { version: _version, ...missingVersion } = validPayload;
    expect(() => HealthResponseSchema.parse(missingVersion)).toThrow();
  });

  it("rejects unexpected extraneous keys due to strict validation", () => {
    expect(() =>
      HealthResponseSchema.parse({
        ...validPayload,
        extraProperty: "unexpected",
      }),
    ).toThrow();
  });
});
