# Shared QA subagent protocol

Follow these four steps alongside your assigned axis playbook to produce the exact `<out_dir>/<axis>-testing.md` report while keeping tracked repository files untouched.

## 1. Selectively load axis guides and run checks

Read this protocol, your assigned axis playbook, and `<out_dir>/context.md` if provided. From the repository root, read `TESTING.md`, `REVIEW.md`, and only the `CODING_STANDARDS.md`, `ARCHITECTURE.md`, linked guides, and package manifest scripts relevant to your axis.

Follow deduplication rules, coverage ownership constraints, and test exemptions in `TESTING.md`, `REVIEW.md`, and coverage configuration before selecting commands or flagging missing tests. Rely on `<out_dir>/context.md` and targeted file diffs rather than repeating broad git or issue queries; when running git commands, set `PAGER=cat` or place `--no-pager` before the subcommand. Launch assigned or discovered verification checks in non-interactive compound invocations, keeping diagnostic analyzers whose non-zero exit codes report findings separated from required downstream test or diff checks.

While backgrounded commands finish, read candidate source and test files owned by your axis in full in parallel batches.

Completion criterion: Relevant axis guides, manifests, source files, test files, and verification outputs are collected.

## 2. Isolate probes and stay within axis scope

Execute and inspect only checks owned by your axis. If a shared runner such as coverage fails inside another axis suite or due to unprovisioned external binaries like a browser runtime, record that external blocker without installing global tools, mutating user home caches, or running suites owned by another axis.

Run exploratory delta probes inline or inside isolated OS temporary directories so the repository workspace and `<out_dir>/` remain clean. Enforce explicit runtime or subprocess timeouts, bind ephemeral loopback ports such as port `0`, use isolated temporary or in-memory state, sanitize host and port environment variables, and stop every spawned server or background child process before completing.

Completion criterion: All exploratory probes finish cleanly with zero leftover processes, mutated user caches, or temporary workspace files.

## 3. Verify uncertain findings against primary sources

Before reporting any candidate finding where you are unsure whether it reflects a defect or an intentional design constraint, inspect `ARCHITECTURE.md` (and linked ADRs), `TESTING.md` (and linked testing guides), docstrings, and targeted history using `git log -S` or `git --no-pager show`. When a candidate depends on external protocols, standards, accessibility specs, or library APIs, verify official primary documentation directly or through the repository research workflow if available. Confirm observable failure with a minimal reproduction, discard disproven candidates, and cite the verified primary source, architecture decision, or commit in every retained finding.

Completion criterion: Every retained finding cites an observed reproduction and verified primary or repository evidence.

## 4. Write report and confirm completion

Write the report to the exact `<out_dir>/<axis>-testing.md` path assigned by the coordinator with Sections 1 to 3 always present and Sections 4 and 5 included only when non-empty. Omit empty conditional headings completely instead of writing placeholder lines.

1. **Logic and scope understanding.** Concise axis-scoped inventory of audited entrypoints, seams, or internal logic. Add one compact Mermaid diagram using `flowchart TD`, `sequenceDiagram`, or `stateDiagram-v2` with at most 8 nodes only when it clarifies non-trivial flows or state machines.
2. **Existing test suite audit.** Assigned test files, pass and fail counts, test-level separation compliance, and assertion quality.
3. **Agent-executed live checks.** Exact test runner, static analysis, coverage, and probe commands executed with exit codes and observed outcomes.
4. **Problems, missing tests, and smells.** Include only when actionable issues exist. Format each item with **Category**, **Location** as `file:line` or entrypoint, **Failure trace** detailing concrete input or mutant, observed versus expected outcome, and verified citation, and **Recommended fix**.
5. **Human verification required.** Include only when modified code requires human sensory judgment, interactive terminal ergonomics, or unmockable external credentials that no test runner, probe, or headless environment can verify, and no automated test covers it. List prerequisites first, then exact copy-pasteable commands with explicit flags and expected outcomes.

Reply to the coordinator in under 150 words confirming the written report path, pass and fail counts, coverage or probe totals, and any verified findings or human checks.

Completion criterion: Report file written cleanly at the exact assigned path and concise confirmation returned to the coordinator.
