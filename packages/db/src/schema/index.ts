import * as systemSchema from "./system";

export * from "./system";

/**
 * Aggregated Drizzle table definitions across all `@devtools/db` domain schemas.
 */
export const schema = {
  ...systemSchema,
};
