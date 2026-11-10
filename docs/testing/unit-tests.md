# Unit testing

Guidelines and patterns for writing white-box unit tests (`*.unit.test.ts` via `test:unit`) across pure functions, Zod schemas, typed domain errors, environment seams, property invariants, and custom React hooks. See [`TESTING.md`](../../TESTING.md) and [`box-testing.md`](box-testing.md) for workspace mappings and runner commands.

## Writing unit tests with `bun:test`

### 1. Testing Zod schema contracts and three-value boundaries

Verify schemas from `@devtools/core` and package `config.ts` modules for default resolution, strict unknown-property rejection (`.strict()`), and three-value boundary edges (`min - 1`, `min`, `min + 1`, `max - 1`, `max`, `max + 1`):

```ts
import { describe, expect, it } from "bun:test";
import { RuntimeConfigSchema } from "@devtools/core";

describe("RuntimeConfigSchema", () => {
  it("resolves default host and port when parsed with an empty object", () => {
    expect(RuntimeConfigSchema.parse({})).toEqual({
      host: "127.0.0.1",
      port: 4000,
    });
  });

  it("accepts boundary ports at 0, 1, 65534, and 65535 and rejects -1 and 65536", () => {
    expect(RuntimeConfigSchema.parse({ port: 0 }).port).toBe(0);
    expect(RuntimeConfigSchema.parse({ port: 1 }).port).toBe(1);
    expect(RuntimeConfigSchema.parse({ port: 65534 }).port).toBe(65534);
    expect(RuntimeConfigSchema.parse({ port: 65535 }).port).toBe(65535);
    expect(() => RuntimeConfigSchema.parse({ port: -1 })).toThrow();
    expect(() => RuntimeConfigSchema.parse({ port: 65536 })).toThrow();
  });

  it("rejects unrecognized keys in strict mode", () => {
    expect(() =>
      RuntimeConfigSchema.parse({
        host: "127.0.0.1",
        port: 4000,
        extraKey: true,
      }),
    ).toThrow();
  });
});
```

### 2. Testing typed domain error classes and cause chains

Verify that domain error subclasses preserve their machine-readable `code`, `exitCode`, `name`, and underlying `cause` error instance:

```ts
import { describe, expect, it } from "bun:test";
import { LighthouseExecutionError } from "@devtools/lighthouse";

describe("LighthouseExecutionError", () => {
  it("preserves error code, exitCode, and original cause instance", () => {
    const rootCause = new Error("Worker exited with code 1");
    const error = new LighthouseExecutionError("Audit worker failed", {
      cause: rootCause,
    });

    expect(error.name).toBe("LighthouseExecutionError");
    expect(error.code).toBe("LIGHTHOUSE_EXECUTION_ERROR");
    expect(error.exitCode).toBe(1);
    expect(error.cause).toBe(rootCause);
    expect(error.message).toBe("Audit worker failed");
  });
});
```

### 3. Testing the seam-pair pattern for environment branches

For functions that accept an optional environment or runtime seam parameter per [`docs/coding-standards/packages.md`](../coding-standards/packages.md#configuration-seams-and-adr-0002), write **two** unit tests: one injecting explicit seam values for each branch and one calling with no arguments so the default parameter path executes under `verify:diff-coverage`:

```ts
import { describe, expect, it } from "bun:test";
import { resolveDatabasePath } from "@devtools/db";

describe("resolveDatabasePath", () => {
  it("returns :memory: when injected env sets NODE_ENV to test", () => {
    expect(resolveDatabasePath({ env: { NODE_ENV: "test" } })).toBe(":memory:");
  });

  it("resolves .devtools/devtools.db when injected env sets NODE_ENV to development", () => {
    const resolved = resolveDatabasePath({ env: { NODE_ENV: "development" } });
    expect(resolved.endsWith(".devtools/devtools.db")).toBe(true);
  });

  it("resolves default runtime path when called without arguments", () => {
    const resolved = resolveDatabasePath();
    expect(typeof resolved).toBe("string");
    expect(resolved.length).toBeGreaterThan(0);
  });
});
```

### 4. Property invariants and metamorphic relations

For normalizers, parsers, and coverage calculators in `packages/*` and `scripts/`, supplement point assertions with invariant checks:

- **Idempotence.** Running `toRepoRelativePath` twice from the repository root produces the exact same string as running it once (`f(f(x)) === f(x)`).
- **Metamorphic relations.** In `calculateDiffCoverage` (`scripts/verify-diff-coverage/verify-diff-coverage.ts`), adding an uncovered executable line to a git diff hunk must decrease or hold equal `diffCoveragePercent`, while adding a type-only interface declaration (`isTypeOnlySource`) must leave `totalModifiedExecutableLines` unchanged.

## Writing React hook unit tests with Vitest

Custom React hooks and pure utilities in `apps/frontend/src/shared/lib/` and slice `model/` / `api/` segments live in `*.unit.test.ts` files with **zero JSX**. Never create unit tests (`*.unit.test.ts` or `*.unit.test.tsx`) for UI components or JSX; presentational components and layouts are tested exclusively through co-located `*.stories.tsx` files and full-stack E2E smoke tests. Test hooks using `renderHook` and `act` from `@testing-library/react`:

```ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMobile } from "./use-mobile";

describe("useMobile", () => {
  it("initializes false and updates when media query change event fires", () => {
    let changeHandler: ((event: MediaQueryListEvent) => void) | undefined;

    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1024,
    });

    window.matchMedia = () =>
      ({
        matches: false,
        addEventListener: (
          _event: string,
          cb: (e: MediaQueryListEvent) => void,
        ) => {
          changeHandler = cb;
        },
        removeEventListener: () => {},
      }) as unknown as MediaQueryList;

    const { result } = renderHook(() => useMobile());
    expect(result.current).toBe(false);

    act(() => {
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: 500,
      });
      changeHandler?.({ matches: true } as MediaQueryListEvent);
    });

    expect(result.current).toBe(true);
  });
});
```
