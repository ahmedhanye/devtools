import { afterEach, beforeEach } from "bun:test";

/**
 * Pinned test timezone for deterministic date formatting across local environments and CI runners.
 */
process.env.TZ = "UTC";

let envSnapshot: Record<string, string | undefined> = {};

/**
 * Runs before each test to capture a snapshot of `process.env`.
 */
beforeEach(() => {
  envSnapshot = { ...process.env };
});

/**
 * Runs after each test to restore `process.env` to its exact pre-test state,
 * preventing cross-test pollution of environment variables such as CI, NO_COLOR, and FORCE_COLOR.
 */
afterEach(() => {
  const currentKeys = new Set(Object.keys(process.env));
  const snapshotKeys = new Set(Object.keys(envSnapshot));

  for (const key of currentKeys) {
    if (!snapshotKeys.has(key)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});
