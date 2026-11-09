import { describe, expect, it } from "bun:test";

describe("test-preload", () => {
  it("pins process.env.TZ to UTC", () => {
    expect(process.env.TZ).toBe("UTC");
  });

  it("permits temporary test mutations to process.env in first test", () => {
    process.env.DEVTOOLS_TEMPORARY_TEST_VAR = "temporary-value";
    expect(process.env.DEVTOOLS_TEMPORARY_TEST_VAR).toBe("temporary-value");
  });

  it("restores process.env in subsequent test so prior mutation is removed", () => {
    expect(process.env.DEVTOOLS_TEMPORARY_TEST_VAR).toBeUndefined();
  });

  it("permits temporary test mutation to existing process.env variables", () => {
    process.env.TZ = "America/New_York";
    expect(process.env.TZ).toBe("America/New_York");
  });

  it("restores existing process.env variables to snapshot in subsequent test", () => {
    expect(process.env.TZ).toBe("UTC");
  });
});
