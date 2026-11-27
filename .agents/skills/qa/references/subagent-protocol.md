# Shared QA subagent protocol

Follow these four steps alongside your assigned box playbook to produce `<out_dir>/<box>-testing.md` while keeping tracked repository files untouched.

## 1. Load box scope and run owned checks

Read this protocol, your assigned box playbook, and your assigned context file (`<out_dir>/black-box-context.md` for Black-box; `<out_dir>/context.md` for Gray-box and White-box). Gray-box and White-box also read relevant root guides (`TESTING.md`, `REVIEW.md`, `CODING_STANDARDS.md`, `ARCHITECTURE.md`) and package manifests.

Run only checks owned by your box using non-interactive flags and explicit outer `timeout` wrappers (such as `timeout 20s` for probes). Keep diagnostic analyzers whose non-zero exit codes report findings separated from required test or diff checks. If a shared runner fails due to an unprovisioned external binary or another box's suite, record the blocker without installing global tools or mutating user home caches.

Keep exploratory probes isolated in OS temporary directories with ephemeral loopback ports (port `0`), sanitized host and port environment variables, and full child-process teardown before finishing.

Completion criterion: Owned files, test runs, and exploratory probes are collected with zero leftover processes or workspace edits.

## 2. Separate proven issues from second-look hints

Classify every candidate observation into one of two buckets before writing the report:

- **Proven issues:** Confirmed observable failures, broken contracts, failing checks, surviving mutants, or clear standards violations backed by a minimal reproduction or tool output. Verify against specs, docs, ADRs, and targeted `git log` history (within your box's allowed visibility) to eliminate false positives.
- **Worth a second look:** Items that pass automated checks today yet feel questionable within your box's lens (for example, logic that contradicts its comment, brittle change-detector tests, leaky seams, or confusing user error messages). Surface only genuine smells with a clear explanation of what it does, why it feels off, and what the human reviewer should verify. Exclude stylistic nitpicks.

Completion criterion: Every observation is verified as either a proven issue, a high-signal second-look hint, or discarded as a false positive.

## 3. Write the deterministic human-first report

Write `<out_dir>/<box>-testing.md` using the exact Markdown structure below. Keep heading names and order identical across runs, omit optional sections completely when empty (never write "None" or placeholder bullets), and keep the report clean and human-readable without raw terminal logs or command dumps.

```markdown
# <Box Name> QA Report

**Verdict:** Pass | Pass with notes | Action required
**Scope:** One-sentence summary of what this box audited.

## At a glance

| Check        | Outcome               | Notes                       |
| :----------- | :-------------------- | :-------------------------- |
| <Check name> | Pass / Fail / Skipped | <Concise counts or outcome> |

## What was reviewed

- <Concise bullet within this box's lens>

## Proven issues

### 1. <Short issue title>

- **Category:** `<Box category>`
- **Where:** `<Entrypoint, user flow, or file:line per box boundary>`
- **What happened:** <Clear description of the failure or gap and expected outcome>
- **Fix:** <Actionable fix>

## Worth a second look

### 1. <Short hint title>

- **Where:** `<Entrypoint or file:line per box boundary>`
- **What it does:** <Plain summary of the current behavior or test>
- **Why it feels off:** <Candid explanation of the contradiction, brittleness, or smell>
- **What to check:** <Specific question for the human reviewer>

## Human checks needed

- **Prerequisites:** <Required setup>

1. <Actionable step with copy-pasteable command and expected outcome>
```

Add at most one compact Mermaid diagram (`flowchart TD`, `sequenceDiagram`, or `stateDiagram-v2`, 8 nodes max) inside `## What was reviewed` only when it clarifies a non-trivial flow. Omit `## Proven issues`, `## Worth a second look`, and `## Human checks needed` completely whenever they have zero items.

Completion criterion: Report file written cleanly at the exact assigned path following the fixed template.

## 4. Return full technical handoff to the coordinator

Return a complete, structured handoff to the coordinator (no artificial word limit) so the main agent can synthesize results and answer follow-up questions without re-running tools:

- Written report path and overall box verdict.
- Exact commands executed, exit codes, pass/fail counts, coverage totals, and mutation counts.
- Full technical details for every proven issue and second-look hint (file paths, line numbers, mutant IDs, concrete reproduction inputs, and verified citations).
- Any external blockers or required human verification steps.

Completion criterion: Complete structured handoff returned to the coordinator.
