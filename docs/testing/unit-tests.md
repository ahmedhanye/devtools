# Unit testing

Patterns for authoring white-box unit tests (`*.unit.test.ts` via `test:unit`) across Zod schemas, domain error subclasses, Configuration Seam pairs, property invariants, and custom React hooks. See [`TESTING.md`](../../TESTING.md) and [`box-testing.md`](box-testing.md) for workspace mappings and anti-patterns.

## Unit test patterns (`bun:test`)

### 1. Zod schema contracts and three-value boundaries

Test default resolution, `.strict()` unknown-key rejection, and three-value numeric edges (`min - 1`, `min`, `min + 1`, `max - 1`, `max`, `max + 1`).

- **Reference suites:** `packages/core/tests/config.unit.test.ts`, `packages/lighthouse/tests/schemas.unit.test.ts`.

### 2. Typed domain errors and `cause` chains

Assert `error.name`, machine-readable `error.code`, `error.exitCode` (where applicable), `error.message`, and identity equality on `error.cause` (`expect(error.cause).toBe(rootCause)`).

- **Reference suites:** `packages/core/tests/errors.unit.test.ts`, `packages/lighthouse/tests/iteration.unit.test.ts`.

### 3. Seam-pair pattern for Configuration Seams

For every function accepting an optional `options.env` or runtime seam per [`docs/coding-standards/packages.md`](../coding-standards/packages.md#configuration-seams-adr-0002), write **two** test cases so both injected branches and the omitted-argument production default execute under `verify:diff-coverage`:

```ts
it("returns :memory: when injected env sets NODE_ENV=test", () => {
  expect(resolveDatabasePath({ env: { NODE_ENV: "test" } })).toBe(":memory:");
});

it("resolves a non-empty default path when called without arguments", () => {
  expect(resolveDatabasePath().length).toBeGreaterThan(0);
});
```

- **Reference suites:** `packages/db/tests/config.unit.test.ts`, `packages/browser/tests/config.unit.test.ts`, `packages/lighthouse/tests/config.unit.test.ts`.

### 4. Property invariants and metamorphic relations

Supplement point assertions on normalizers, diff engines, and coverage calculators with structural invariants:

- **Idempotence.** Normalizing a path twice yields the exact output of normalizing once (`f(f(x)) === f(x)`).
- **Metamorphic relations.** Adding an uncovered executable line to a git diff hunk lowers or preserves `diffCoveragePercent`, while adding a type-only interface leaves `totalModifiedExecutableLines` unchanged (`scripts/verify-diff-coverage/verify-diff-coverage.ts`).
- **Reference suites:** `packages/lighthouse/tests/median.unit.test.ts`, `packages/lighthouse/tests/normalizer.unit.test.ts`, `packages/lighthouse/tests/diff.unit.test.ts`.

## React hook unit tests (Vitest)

Pure utilities and hooks in `apps/frontend/src/shared/lib/` and slice `model/` or `api/` segments use `*.unit.test.ts` with **zero JSX** (`renderHook` and `act` from `@testing-library/react`). Never create unit tests (`*.unit.test.ts` or `*.unit.test.tsx`) for UI components; test presentational UI strictly via [`stories.md`](stories.md).

```ts
const { result } = renderHook(() => useMobile());
expect(result.current).toBe(false);
act(() => triggerViewportChange(500));
expect(result.current).toBe(true);
```

- **Reference suite:** `apps/frontend/src/shared/lib/use-mobile/use-mobile.unit.test.ts`.
