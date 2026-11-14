# White-box testing playbook

Follow [the shared protocol](subagent-protocol.md) and these steps to create `<out_dir>/white-box-testing.md`.

**Axis inspection boundary.** Audit internal control-flow branches, statement and condition coverage, diff-scoped mutation sensitivity, dependency and environment isolation, algebraic invariants, unit oracle quality, complexity, and code health across non-exempt executable source files paired with unit suites. Leave integration contracts to Gray-box and external workflow checks to Black-box.

## White-box workflow

### 1. Audit control-flow branches, invariants, and test oracle quality

Audit five white-box dimensions across non-exempt modified executable source and unit test files, honoring test exemptions in `TESTING.md` and coverage configuration before flagging missing tests:

1. **Statement, branch, and condition coverage.** Catalog executable statements, conditional branches, ternaries, switch arms, short-circuit expressions like `&&`, `||`, and nullish coalescing, loop counts of `0`, `1`, and `N`, and error cleanup blocks. Line-hit coverage reports alone do not verify both outcomes of short-circuit conditions.
2. **Dependency seams and global isolation.** Check injected configuration, time, filesystem, and environment seams per `CODING_STANDARDS.md` and `TESTING.md` (and their linked unit testing and standards guides), and confirm unit tests avoid mutating process or global runtime state across test cases.
3. **Property-based and metamorphic invariants.** Check whether pure parsers, path normalizers, sorters, and calculators verify algebraic properties such as round-trip invertibility, idempotence, and predictable metamorphic transformations.
4. **Unit test anti-pattern scan.** Audit unit suites against six oracle failure modes:
   - **Tautological assertions.** Recomputing expected values with the production formula instead of asserting independent known-good literals.
   - **Implementation-coupled mocking.** Mocking owned internal collaborators, testing private helpers directly, or asserting internal call ordering over observable outcomes.
   - **Bypassing the system under test.** Replacing target logic with a mock or verifying state solely through unrelated side channels.
   - **Weak coverage padding.** Guarding assertions inside conditionals or asserting only type presence or definedness without checking exact domain values and error types.
   - **Boundary and negative-path blindness.** Testing only interior happy paths while omitting empty inputs, zero, negative bounds, edge values, and expected error paths.
   - **Unverified snapshot abuse.** Locking in large unverified snapshots or asserting decorative formatting over behavior.
5. **Complexity, dead-code, and duplication triage.** Inspect static analyzer findings for elevated complexity, unused exports, and semantic duplication while filtering idiomatic boilerplate permitted by `TESTING.md` and its linked testing guides.

Completion criterion: Branch catalog, isolation review, invariant checks, oracle scan, and static code-health triage complete.

### 2. Run or trace diff-scoped mutation analysis

Apply mutation analysis strictly to non-exempt executable source code, excluding documentation, markdown content, and non-executable fixtures.

Run any repository-configured mutation testing runner against modified source first and inspect surviving or uncovered mutants. Otherwise trace these mutation classes manually across conditionals, boundary comparisons, early guards, input normalizers, and option pass-through objects:

- **Relational operator replacement, known as `ROR`.** Mutate `<` to `<=` or `>`, `>` to `>=` or `<`, and equality checks to inequality checks.
- **Logical connector, unary, and boolean literal mutations.** Swap `&&` and `||` under `LCR`, insert unary negation under `UOI`, delete unary negation under `UOD`, and flip boolean literals.
- **Arithmetic, statement deletion, call, and object mutations.** Mutate arithmetic operators under `AOR`, delete early `return` or `throw` guards under `SDL`, omit string or input normalizers such as whitespace trimming or case folding, and drop forwarded object fields.

For each mutant:

1. **Filter equivalent mutants.** Confirm at least one valid input causes the mutated code to produce a different observable return value, state change, or error. Discard equivalent mutants whose fallback paths produce identical observable output for all inputs.
2. **Isolate surviving mutants.** Identify the exact unit test and assertion line that kills each non-equivalent mutant. When all unit tests pass despite a non-equivalent mutant, record it as a `Surviving mutant` with the concrete distinguishing input.

Completion criterion: Every modified executable conditional, guard, normalizer, and forwarded field checked by automated or manual mutation analysis, with all surviving mutants verified.

### 3. Write report

Verify uncertain findings and surviving mutants per [the shared protocol](subagent-protocol.md), then write `<out_dir>/white-box-testing.md` using these Section 4 categories: `Surviving mutant`, `Uncovered branch`, `Test anti-pattern`, `Seam violation`, `Complexity or duplication smell`, or `Standards violation`.

Completion criterion: `<out_dir>/white-box-testing.md` written and completion confirmation sent to the coordinator.
