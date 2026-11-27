# Black-box testing playbook

Follow [the shared protocol](subagent-protocol.md) and these steps to create `<out_dir>/black-box-testing.md`.

**Strict outside-in boundary.** Read only `<out_dir>/black-box-context.md`, user-facing documentation, and public CLI `--help` or rendered UI outputs. Never read production source files, build configurations, ADRs, or test source files. Write strictly in plain user-visible terms: never mention internal file paths, config filenames, cookie or storage keys, CSS/DOM selectors, internal schema names, or ADR numbers in the report. Leave test-file code quality to White-box and module/wire contracts to Gray-box.

## Black-box workflow

### 1. Map user-facing behavior partitions

From `<out_dir>/black-box-context.md` and public CLI `--help` or UI entrypoints, map expected external behavior using specification-based techniques:

- **Equivalence partitioning:** Group flags, arguments, environment variables, and UI controls into valid and invalid partitions, testing invalid partitions individually so early rejection does not mask another validation bug.
- **Three-value boundary analysis:** For integer bounds `min` and `max`, check `min - 1`, `min`, `min + 1`, `max - 1`, `max`, and `max + 1`; for decimals, check the smallest precision step around each edge.
- **Decision tables and state transitions:** Map combinations of flags and runtime conditions against expected outcomes, exit codes, and UI states.
- **Process and stream contracts:** Verify happy and recovery paths, termination signals (`SIGINT`, `SIGTERM`) where supported, non-zero exit codes, and `stdout` vs. `stderr` separation.

Completion criterion: User-facing partitions, boundaries, and state expectations mapped for every modified public entrypoint.

### 2. Run assigned external suites

Execute only the assigned end-to-end, UI story, and binary smoke commands. Record user-visible pass/fail outcomes, interactive state behaviors, and any environment blockers without inspecting test source code.

Completion criterion: Assigned external suites executed and uncovered user-facing gaps listed for probing.

### 3. Probe uncovered external gaps

Run delta-only outside-in exploratory probes on public boundaries and adversarial inputs missing from automated runs:

- **Boundary edges:** Probe numeric flags, limits, and environment variables near modified bounds.
- **Adversarial inputs:** Probe partial numeric strings, wrong types, malformed numbers, empty strings, and invalid paths to confirm clean rejection exit codes and plain-language diagnostics without raw validation dumps or unhandled tracebacks.

Completion criterion: Uncovered external gaps probed and minimal user-level reproductions captured for any failures.

### 4. Surface UX hints and write report

Identify any **Worth a second look** UX or messaging smells within the outside-in lens (confusing workflows, inconsistent CLI flags or UI labels, or overly technical error messages shown to end users).

Write `<out_dir>/black-box-testing.md` per [the shared protocol](subagent-protocol.md) using these `Proven issues` categories: `Defect`, `Spec mismatch`, `Missing E2E coverage`, `Missing UI coverage`. Return the full technical handoff (exact commands, exit codes, and probe transcripts) to the coordinator.

Completion criterion: `<out_dir>/black-box-testing.md` written cleanly in plain user terms and full handoff returned.
