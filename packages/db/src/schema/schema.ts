import * as lighthouseSchema from "./lighthouse";
import * as systemSchema from "./system";

export { lighthouseRuns, type LighthouseRunRow } from "./lighthouse";
export { systemMetadata } from "./system";

/**
 * Aggregated Drizzle table definitions across all `@devtools/db` domain schemas.
 */
export const schema = {
  ...systemSchema,
  ...lighthouseSchema,
};
