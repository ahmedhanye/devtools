import { describe, expect, it } from "bun:test";
import * as Core from "../src/index";

describe("@devtools/core exports", () => {
  it("exports all health contracts and schemas", () => {
    expect(Core.HealthStatusSchema).toBeDefined();
    expect(Core.HealthResponseSchema).toBeDefined();
  });

  it("exports all runtime configuration contracts and schemas", () => {
    expect(Core.RuntimeConfigSchema).toBeDefined();
    expect(Core.APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("exports all error contracts, schemas, and codes", () => {
    expect(Core.ApiErrorResponseSchema).toBeDefined();
    expect(Core.API_ERROR_CODES).toBeDefined();
  });
});
