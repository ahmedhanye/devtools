# White-box testing playbook

Playbook for the white-box QA subagent. Follow the **Shared subagent protocol** in [`SKILL.md`](SKILL.md) alongside the white-box rules below to create `.scratch/qa/<timestamp>-<slug>/white-box-testing.md`.

**Axis inspection boundary.** Audit internal control-flow branches, statement and condition coverage, diff-scoped mutation sensitivity, seam-pair default parameters, algebraic and metamorphic invariants, unit test oracle quality, and code complexity across all modified executable source files paired with `*.unit.*` suites. Leave cross-module HTTP/database integration contracts to Gray-box and external CLI subprocess or UI story workflows to Black-box.

## White-box workflow

### 1. Audit control-flow branches, invariants, and test oracle quality

Audit five white-box dimensions across assigned executable source and `*.unit.*` files (omitting a standalone `test:unit` run when `test:coverage` already runs unit suites):

1. **Statement, branch, and error-path coverage.** Catalog executable statements, control-flow branches (`if`/`else`, ternary, `switch`, short-circuit `&&`, `||`, `??`), loop boundaries (`0`, `1`, `N` iterations), and `try`/`catch`/`finally` paths.
2. **Seam-pair and call-chain forwarding compliance.** Verify functions branching on runtime environment or OS state accept injectable parameters with production defaults, forward complete seam objects, and test **both** injected and default 0-argument paths in `*.unit.*` without mutating global `process` or runtime properties.
3. **Property-based and metamorphic invariants.** Check whether pure parsers, path normalizers, sorters, and calculators verify algebraic properties: round-trip invertibility (`parse(format(x)) === x`), idempotence (`normalize(normalize(x)) === normalize(x)`), and metamorphic input-output relations ($f(T(x))$ predictable from $f(x)$).
4. **Unit test anti-pattern scan.** Audit assigned `*.unit.*` files against six universal test oracle failure modes:
   - **Tautological assertions.** Recomputing expected values with the same formula or helper as production code instead of asserting independent known-good literals.
   - **Implementation-coupled mocking.** Mocking internal collaborators, testing private helpers, or asserting spy call counts and order instead of public return values and state.
   - **Mocking or bypassing the system under test.** Replacing target logic with a mock or verifying state through side channels.
   - **Weak or conditional coverage padding.** Wrapping assertions inside `if` conditions or asserting only `typeof` / `.toBeDefined()` without checking exact domain values and error codes.
   - **Boundary and negative-path blindness.** Testing only interior happy-path values while omitting empty inputs, `0`, `-1`, `NaN`, case sensitivity, boundary edges (`min - 1`, `min`, `min + 1`, `max - 1`, `max`, `max + 1`), and error throws.
   - **Unverified snapshot or brittle copy assertions.** Locking in large unverified snapshots or asserting decorative prose and styling tokens.
5. **Complexity, dead-code, and duplication triage.** Review static analyzer outputs for elevated cyclomatic or cognitive complexity, unused exports, and semantic duplication, filtering out idiomatic boilerplate defined in repository testing docs.

### 2. Trace diff-scoped mutations and filter equivalent mutants

For every conditional, boundary comparison, guard clause, string normalization, and seam pass-through in assigned executable source files, trace standard mutation operators:

- **Relational operator replacement (ROR).** Change `<` to `<=` or `>`, `>` to `>=` or `<`, and equality `===` to `!==`.
- **Logical and unary operator replacement (COR/LCR/UOI).** Change `&&` to `||`, remove `!`, or flip boolean literals.
- **Arithmetic, call, and statement deletion (AOR/SDL).** Change `+` to `-`, shift index offsets by one, omit forwarded seam properties or `.toLowerCase()` / `.trim()` transformations, or delete early guard `return` or `throw` statements.

For each mutant:

1. **Filter equivalent mutants.** Confirm at least one valid input exists where mutated code produces a different observable return value, state change, or error. Discard equivalent mutants where fallback paths produce identical observable output for all inputs.
2. **Isolate surviving mutants.** Identify the exact unit test and assertion line that kills each non-equivalent mutant. If all unit tests pass for a non-equivalent mutant, record it as a **Surviving mutant** with the concrete input that distinguishes the mutant from original code.

### 3. Write report

Verify uncertain findings and surviving mutants per shared protocol, then write `.scratch/qa/<timestamp>-<slug>/white-box-testing.md` using the Section 4 categories: `Surviving mutant`, `Uncovered branch`, `Test anti-pattern`, `Seam violation`, `Complexity/duplication smell`, or `Standards violation`.
