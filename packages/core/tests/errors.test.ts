import { describe, expect, it } from "bun:test";
import {
  API_ERROR_CODES,
  type ApiErrorResponse,
  ApiErrorResponseSchema,
} from "../src/errors";

describe("API_ERROR_CODES", () => {
  it("defines standard HTTP/RPC error codes", () => {
    expect(API_ERROR_CODES.BAD_REQUEST).toBe("BAD_REQUEST");
    expect(API_ERROR_CODES.NOT_FOUND).toBe("NOT_FOUND");
    expect(API_ERROR_CODES.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
    expect(API_ERROR_CODES.SERVICE_UNAVAILABLE).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("ApiErrorResponseSchema", () => {
  it("accepts valid error response without details", () => {
    const errorPayload: ApiErrorResponse = {
      error: {
        code: API_ERROR_CODES.BAD_REQUEST,
        message: "Invalid query parameter",
      },
    };
    const parsed = ApiErrorResponseSchema.parse(errorPayload);
    expect(parsed).toEqual(errorPayload);
  });

  it("accepts valid error response with details of any shape", () => {
    const withObjectDetails: ApiErrorResponse = {
      error: {
        code: API_ERROR_CODES.NOT_FOUND,
        message: "Resource not found",
        details: { entity: "task", id: 42 },
      },
    };
    expect(ApiErrorResponseSchema.parse(withObjectDetails)).toEqual(
      withObjectDetails,
    );

    const withArrayDetails: ApiErrorResponse = {
      error: {
        code: API_ERROR_CODES.BAD_REQUEST,
        message: "Validation failed",
        details: ["field 'port' must be >= 1"],
      },
    };
    expect(ApiErrorResponseSchema.parse(withArrayDetails)).toEqual(
      withArrayDetails,
    );
  });

  it("rejects empty code or empty message", () => {
    expect(() =>
      ApiErrorResponseSchema.parse({
        error: {
          code: "",
          message: "Something happened",
        },
      }),
    ).toThrow();

    expect(() =>
      ApiErrorResponseSchema.parse({
        error: {
          code: "ERR",
          message: "",
        },
      }),
    ).toThrow();
  });

  it("rejects missing code or message", () => {
    expect(() =>
      ApiErrorResponseSchema.parse({
        error: {
          message: "No code provided",
        },
      }),
    ).toThrow();

    expect(() =>
      ApiErrorResponseSchema.parse({
        error: {
          code: "NO_MESSAGE",
        },
      }),
    ).toThrow();
  });

  it("rejects payload missing the error wrapper", () => {
    expect(() =>
      ApiErrorResponseSchema.parse({
        code: "BAD_REQUEST",
        message: "Missing wrapper",
      }),
    ).toThrow();
  });

  it("rejects unexpected extraneous keys at the root level", () => {
    expect(() =>
      ApiErrorResponseSchema.parse({
        error: {
          code: "ERR",
          message: "Error message",
        },
        extra: "root-level-disallowed",
      }),
    ).toThrow();
  });

  it("rejects unexpected extraneous keys inside the error object", () => {
    expect(() =>
      ApiErrorResponseSchema.parse({
        error: {
          code: "ERR",
          message: "Error message",
          extraField: "nested-disallowed",
        },
      }),
    ).toThrow();
  });
});
