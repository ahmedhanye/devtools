# Test quality and refactoring

Criteria and safe refactoring steps for improving existing test suites without losing fault detection. Read this guide alongside [`TESTING.md`](../../TESTING.md), [`box-testing.md`](box-testing.md), [`integration-tests.md`](integration-tests.md), and [`REVIEW.md`](../../REVIEW.md) when auditing or cleaning up existing tests.

## Value and refactor resilience

Vladimir Khorikov models test value as a product of four factors: protection against regressions, resistance to refactoring, fast feedback, and maintainability. Because the model is multiplicative, a test that scores zero on resistance to refactoring has zero net value. Deleting a brittle test is a valid improvement after confirming it holds no unique fault detection.

Apply the Google Testing Blog change-detector litmus test before keeping any unit test. Ask whether inlining, splitting, or rewriting internal helpers while preserving the public contract still leaves the test green. When a test fails that check, replace interaction assertions on internal helpers with state or output assertions at the public seam.

## Test level promotion

When a `*.unit.test.ts` file mocks three or more internal modules to simulate a workflow, promote it to a `*.integration.test.ts` suite instead of rewriting the mocks. Use socketless `createApp().request()`, ephemeral Daemons on `port: 0`, `:memory:` SQLite handles, or isolated `fs.mkdtempSync()` directories per [`integration-tests.md`](integration-tests.md).

Prefer fakes and stubs over spies and mocks. Reserve interaction assertions for external system boundaries where no local fake exists.

## Additional test smells

These smells supplement the nine prohibited anti-patterns in [`TESTING.md`](../../TESTING.md#prohibited-testing-anti-patterns-and-false-positive-guards).

| Smell                                     | Why it fails                                                                              | What to do instead                                                                           |
| :---------------------------------------- | :---------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------- |
| **Assertion Roulette**                    | Multiple unlabelled assertions in one test hide which condition failed in CI              | Split into focused tests by behavior or add descriptive assertion messages                   |
| **Mystery Guest**                         | Test depends on external files, shared globals, or magic IDs hidden outside the test body | Inline a fresh fixture using `fs.mkdtempSync()` or `:memory:` SQLite seed data               |
| **Rotten Green (conditional assertions)** | Assertions inside `if` or `try`/`catch` blocks pass without executing                     | Remove control flow from test bodies and assert errors directly with `expect(...).toThrow()` |
| **Mock-return mirroring**                 | Test asserts that a mock returned the exact value the test just configured                | Assert observable return values or state changes produced by the system under test           |

## Safe test refactoring workflow

Follow this four-phase loop when cleaning up an existing suite:

1. **Triage.** Read production public seams before judging tests. Classify findings against [`TESTING.md`](../../TESTING.md), its false-positive guards, and the smells above.
2. **Capture a protection baseline.** Run the scoped test suite and save a complete `fallow mutation` JSON baseline before editing tests:

```bash
bunx fallow mutation <target-src> --format json --quiet -o .scratch/mutation-before.json
```

Use `--kill-matrix` or `--kill-matrix-for <test-file-or-id>` before deleting tests to check whether another test already kills the same mutants.

3. **Remediate.** Delete redundant change-detector tests, promote overmocked unit tests to integration suites, replace weak assertions with independent known-good literals and boundary values, and isolate shared fixtures.
4. **Verify no regression.** Re-run the scoped test suite, check diff coverage (`bun run verify:diff-coverage` per [`REVIEW.md`](../../REVIEW.md)), and compare against the saved mutation baseline:

```bash
bunx fallow mutation <target-src> --compare .scratch/mutation-before.json --allow-dirty
```

Run `fallow mutation` without `--recheck` after editing or deleting tests that previously killed mutants, because `--recheck` only reruns previously open (`survived` or `no_coverage`) mutants.

### Mutation triage

| Outcome               | Action                                                                                         |
| :-------------------- | :--------------------------------------------------------------------------------------------- |
| **Test gap**          | Add or strengthen an assertion with a concrete distinguishing input                            |
| **Equivalent mutant** | Leave untested when the mutation is semantically identical to the original code                |
| **Dead code**         | Delete the unreachable branch or symbol via `bun run fallow:dead-code` instead of adding tests |
| **Production defect** | Fix the production bug and add a regression test at the public seam                            |
