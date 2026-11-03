# Black-box testing playbook

Playbook for the black-box QA subagent. Follow the **Shared subagent protocol** in [`SKILL.md`](SKILL.md) alongside the black-box rules below to create `.scratch/qa/<timestamp>-<slug>/black-box-testing.md`.

**Axis inspection boundary.** Evaluate observable external behavior, standalone CLI binary and subprocess invocations, end-to-end user workflows, and interactive UI component stories (`*.e2e.*`, and `*.stories.*` where applicable) from an external caller or user perspective. Leave in-process HTTP route, header, middleware, and static-asset integration seams to Gray-box, and internal helper branches, unit spies, and mutation tracing to White-box.

## Black-box workflow

### 1. Map specification partitions

Map specification requirements and public entrypoints using specification-based test design techniques:

- **Equivalence partitioning.** Group CLI flags, arguments, environment variables, and UI inputs into valid and invalid partitions where members trigger identical handling. Test invalid partitions individually so one rejection never masks another.
- **Three-value boundary value analysis.** For numeric, length, or count ranges `[min, max]`, identify test points at `min - 1`, `min`, `min + 1`, `max - 1`, `max`, and `max + 1`.
- **Decision tables.** Map combinations of flags, configuration options, and runtime conditions against expected outputs and exit codes to expose contradictory or missing rules.
- **State transitions.** Model daemon, server, and interactive UI component lifecycles (such as open/close overlays, collapsible sidebars, and focus states) as finite state machines. Check valid transitions and verify that invalid events fail with clear diagnostics.
- **Scenario and process lifecycle flows.** Check end-to-end happy paths, recovery paths, cancellation signals (`SIGINT`, `SIGTERM`), and output stream separation (`stdout` for data vs `stderr` for logs and diagnostics).

### 2. Audit assigned E2E and UI suites

Audit assigned test files and completed results against repository testing standards:

- Confirm end-to-end or interactive UI tests exist for modified user capabilities and follow level-separation rules (flag any `*.e2e.*` file mocking internal module helpers instead of exercising real subprocesses or user interactions).
- Verify assertions check observable behavioral contracts (exit codes, `stderr` diagnostics, output schemas, semantic landmarks, accessible roles, keyboard interactions `{Enter}`, `{Escape}`, `{Tab}`, and completed UI state transitions such as overlays disappearing on close).
- Record scenarios and boundaries already covered by passing automated suites so step 3 probes only uncovered external gaps.

### 3. Run delta-only exploratory probes

Identify and probe uncovered external CLI, subprocess, or workflow inputs missing from passing `*.e2e.*` and `*.stories.*` suites:

- **Uncovered CLI boundary edges.** Three-value boundary inputs (`min - 1`, `min`, `min + 1`, `max - 1`, `max`, `max + 1`) on modified CLI flags or environment variables lacking E2E assertions.
- **Adversarial CLI parser inputs.** Partial numeric strings (`4000abc`), floats on integer flags (`4000.5`), `NaN`, empty strings, and invalid binary paths, verifying non-zero exit codes and actionable human-readable `stderr` diagnostics (confirming raw JSON schema dumps or unhandled stack traces never print to users).

### 4. Write report

Verify uncertain findings per shared protocol, then write `.scratch/qa/<timestamp>-<slug>/black-box-testing.md` using the Section 4 categories: `Defect`, `Spec mismatch`, `Missing E2E/UI test`, `Test anti-pattern`, or `Standards violation`.
