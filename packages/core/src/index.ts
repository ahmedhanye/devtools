/**
 * Shared domain schemas, configuration contracts, and error envelopes for DevTools.
 *
 * @packageDocumentation
 */
export {
  APP_VERSION,
  RuntimeConfigError,
  RuntimeConfigSchema,
  formatRuntimeConfigError,
  parsePortFromEnv,
  type EnvMap,
  type RuntimeConfig,
} from "./config";
export {
  API_ERROR_CODES,
  ApiErrorResponseSchema,
  type ApiErrorCode,
  type ApiErrorResponse,
} from "./errors";
export {
  HealthResponseSchema,
  HealthStatusSchema,
  type HealthResponse,
  type HealthStatus,
} from "./health";
