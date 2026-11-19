# Black-box testing playbook

Follow [the shared protocol](subagent-protocol.md) and these steps to create `<out_dir>/black-box-testing.md`.

**Axis inspection boundary.** Audit external observable behavior, public entrypoints, CLIs, standalone binaries, end-to-end workflows, and interactive UI components where applicable from an external caller perspective. Leave in-process module integration seams and database internals to Gray-box, and leave internal control-flow branches, static analyzers, unit suites, and mutation tracing to White-box.

## Black-box workflow

### 1. Map specification partitions

Map modified specifications and public entrypoints using specification-based test design techniques:

- **Equivalence partitioning.** Group flags, arguments, environment variables, API inputs, and UI controls into valid and invalid partitions. Test invalid partitions individually so one early rejection never hides another parser or validation bug.
- **Three-value boundary value analysis.** For ordered integer ranges bounded by `min` and `max`, identify boundary points at `min - 1`, `min`, `min + 1`, `max - 1`, `max`, and `max + 1`. For continuous decimals or non-unit steps, test the smallest valid precision step around each edge.
- **Decision tables.** Map combinations of options, flags, and runtime conditions against expected outcomes and exit codes to expose missing or contradictory rules.
- **State transitions.** Model long-lived services, CLIs, workflows, and stateful UI widgets as finite state machines. Verify valid transitions, confirm rejected invalid events produce clear diagnostics, and confirm dismissible UI components handle state completion safely per specification.
- **Process and output lifecycle.** Verify end-to-end happy and recovery paths, termination signals such as `SIGINT` and `SIGTERM` where supported, non-zero error exit codes, and stream separation keeping program output on `stdout` and diagnostics on `stderr`.

Completion criterion: Specification partitions, boundaries, state transitions, and lifecycle expectations mapped for every modified public entrypoint.

### 2. Audit assigned end-to-end and UI suites

Review assigned end-to-end, workflow, and UI interaction suites and completed runs against `TESTING.md` and its linked E2E and UI testing guides:

- Confirm tests exercise real public binaries, subprocesses, rendered workflows, or interactive component harnesses rather than mocking internal module helpers inside end-to-end files.
- Verify assertions check observable external contracts including exit codes, `stderr` diagnostics, structured output schemas, accessible semantics, keyboard navigation where UI applies, and completed state transitions.
- Record behaviors already verified by passing automated suites so step 3 probes only uncovered external gaps.

Completion criterion: Suite audit complete with uncovered external behaviors listed for probing.

### 3. Run delta-only exploratory probes

Probe uncovered external inputs and workflows missing from passing automated suites without provisioning global tooling or probing private module internals:

- **Uncovered boundary edges.** Probe boundary inputs around modified numeric flags, limits, and environment variables lacking automated tests.
- **Adversarial input parsing.** Probe partial numeric strings, wrong numeric types, malformed numbers, empty strings, and invalid paths to confirm clean rejection exit codes and human-readable diagnostics without raw validation dumps or unhandled tracebacks.

Completion criterion: Uncovered external gaps probed and minimal reproductions captured for any failures.

### 4. Write report

Verify uncertain findings per [the shared protocol](subagent-protocol.md), then write `<out_dir>/black-box-testing.md` using these Section 4 categories: `Defect`, `Spec mismatch`, `Missing E2E test`, `Missing UI test`, `Test anti-pattern`, or `Standards violation`.

Completion criterion: `<out_dir>/black-box-testing.md` written and completion confirmation sent to the coordinator.
