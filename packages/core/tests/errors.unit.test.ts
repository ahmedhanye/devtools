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
    expect(API_ERROR_CODES.FORBIDDEN).toBe("FORBIDDEN");
    expect(API_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE).toBe(
      "UNSUPPORTED_MEDIA_TYPE",
    );
  });
});

describe("ApiErrorResponseSchema", () => {
  it("accepts valid error response without details including CONFLICT and VALIDATION_ERROR codes", () => {
    const errorPayload: ApiErrorResponse = {
      error: {
        code: API_ERROR_CODES.BAD_REQUEST,
        message: "Invalid query parameter",
      },
    };
    const parsed = ApiErrorResponseSchema.parse(errorPayload);
    expect(parsed).toEqual(errorPayload);

    expect(
      ApiErrorResponseSchema.parse({
        error: {
          code: API_ERROR_CODES.CONFLICT,
          message: "Audit job already running",
          details: { activeJobId: "job-1" },
        },
      }).error.code,
    ).toBe("CONFLICT");

    expect(
      ApiErrorResponseSchema.parse({
        error: {
          code: API_ERROR_CODES.VALIDATION_ERROR,
          message: "Invalid field",
        },
      }).error.code,
    ).toBe("VALIDATION_ERROR");
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
