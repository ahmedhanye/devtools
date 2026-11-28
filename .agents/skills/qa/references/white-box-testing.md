# White-box testing playbook

Follow [the shared protocol](subagent-protocol.md) and these steps to create `<out_dir>/white-box-testing.md`.

**Axis inspection boundary.** Audit internal control-flow branches, statement/branch/diff coverage, tool-driven mutation testing, dependency and environment seams, algebraic invariants, complexity/dead-code/duplication, and test-code quality across modified unit, E2E, and UI story test files. Leave integration seams and integration mock fidelity to Gray-box, and external user workflows to Black-box.

## White-box workflow

### 1. Run static health, unit, and coverage checks

Execute assigned typecheck, lint, unit suites, coverage, diff-coverage, and code-health checks (complexity, dead code, duplication). Honor test exemptions in `TESTING.md` and coverage configuration before flagging missing tests.

Completion criterion: Typecheck, lint, unit, coverage, and static code-health outputs collected.

### 2. Audit branches, seams, and test-code quality

Audit non-exempt modified source files and modified unit, E2E, and UI story test files across these dimensions:

- **Branch and condition coverage:** Check conditional branches, ternaries, switch arms, short-circuit expressions (`&&`, `||`, `??`), loop counts (`0`, `1`, `N`), and error cleanup blocks.
- **Dependency seams and isolation:** Check injected configuration, time, filesystem, and environment seams per `CODING_STANDARDS.md` and `TESTING.md`, and confirm tests avoid mutating global runtime state across cases.
- **Algebraic invariants:** Check whether pure parsers, normalizers, sorters, and calculators verify round-trip invertibility, idempotence, and metamorphic invariants.
- **Test-code anti-patterns:** Audit unit, E2E, and UI story test files against `TESTING.md` and `docs/testing/test-quality.md` (tautological assertions, implementation-coupled mocks, brittle CSS/prose selectors, weak coverage padding, boundary/negative-path blindness, and unverified snapshots).
- **Complexity and duplication triage:** Inspect static analyzer findings while filtering idiomatic boilerplate permitted by `TESTING.md`.

Completion criterion: Branch catalog, seam isolation, invariant checks, and test-code anti-pattern audit complete.

### 3. Run tool-driven mutation testing

Detect any mutation testing runner installed in the repository (such as `fallow mutation`, consulting [the fallow skill](../../fallow/SKILL.md) when present, or a configured project runner like Stryker or `cargo-mutants`). Never perform manual mental mutation tracing.

- **If no mutation runner is configured:** Record `Skipped (no mutation tool configured)` in the report scorecard and proceed to step 4.
- **If a mutation runner is installed:** Run it diff-scoped against non-exempt modified source code with bounded defaults, then inspect only open (`survived` or `no_coverage`) mutants. For example, with Fallow:

```bash
fallow mutation --base <base-ref> --allow-dirty --time-budget 90s --mutants-per-line 2 --format json --quiet
fallow mutation tasks --format json --quiet
```

Triage each open mutant as a **Test gap**, **Dead code**, **Production defect**, or **Equivalent mutant**, and record non-equivalent gaps as `Surviving mutant` under `Proven issues`.

Completion criterion: Mutation runner executed (or explicitly recorded as skipped) and all returned open mutants triaged.

### 4. Surface logic and brittle-test hints, then write report

Identify **Worth a second look** items that pass tests today yet smell off:

- Comments or docstrings whose explanation contradicts the code or feels wrong.
- Brittle change-detector tests (such as asserting arbitrary magic constants like `x = 0` or internal identifiers that break on harmless refactors).
- Convoluted or fragile control flow that warrants a human sanity check.

Write `<out_dir>/white-box-testing.md` per [the shared protocol](subagent-protocol.md) using these `Proven issues` categories: `Surviving mutant`, `Uncovered branch`, `Test anti-pattern`, `Seam violation`, `Complexity or duplication smell`, `Standards violation`. Return the full technical handoff (including mutant IDs, coverage numbers, and exact line references) to the coordinator.

Completion criterion: `<out_dir>/white-box-testing.md` written cleanly and full handoff returned.
