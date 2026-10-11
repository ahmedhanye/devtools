---
name: quality-assurance
description: Synthesize automated code review findings with human verification tasks beyond CI.
disable-model-invocation: true
---

# Quality assurance

Synthesize automated code review findings with human-in-the-loop manual verification beyond CI capabilities.

Run this skill when invoked with `/quality-assurance` followed by a fixed point (commit SHA, branch name, tag, or ref).

## Process

### 1. Pin and validate the fixed point

Accept the fixed point supplied by the user (such as `main`, `HEAD~3`, a branch name, or a commit SHA). If omitted, ask the user for the fixed point before continuing.

Validate the reference before starting work:

1. Confirm the reference resolves:
   ```bash
   git rev-parse <fixed-point>
   ```
   If resolution fails, halt immediately with an actionable error.
2. Verify the diff is non-empty:
   ```bash
   git diff <fixed-point>...HEAD --stat
   ```
   If the diff is empty, halt immediately. Do not launch review subagents on empty diffs or invalid refs.
3. Capture the commit log:
   ```bash
   git log <fixed-point>..HEAD --oneline
   ```
4. Sanitize the fixed point into a filesystem-safe slug `<ref>` by replacing slashes and special characters with hyphens.

### 2. Run delegated code review

Delegate code review across `<fixed-point>...HEAD` following `.agents/skills/code-review/SKILL.md`.

Execute the two review axes in parallel subagents to preserve context isolation:
- **Standards axis**: evaluate code against repository standards and the Fowler smell baseline.
- **Spec axis**: evaluate implementation fidelity against the originating issue, specification, or ticket.

Collect and aggregate the structured reports from both axes.

### 3. Generate code review summary artifact

Generate Artifact 1 strictly after the code review subagent completes.

Write the artifact using `write_to_file` to the conversation artifact directory with `ArtifactMetadata` (`UserFacing: true`, `RequestFeedback: false`, and a concise summary) to render in the UI panel. Mirror the content to repository path `tmp/qa/code-review-<ref>.md`.

Structure Artifact 1 with these sections:

1. **Review metadata**: fixed point, commit range, author, originating spec or ticket.
2. **Standards evaluation**: hard repository standard violations with file and rule citations, plus smell baseline observations.
3. **Spec fidelity evaluation**: missing requirements, unrequested additions (scope creep), and implementation discrepancies.
4. **Health scorecard**: total findings per axis and the primary defect within each axis.

### 4. Evaluate human impact skip gate

Inspect the modified files to determine if human manual verification is warranted.

Skip Artifact 2 if the diff introduces zero runtime behavior changes:
- Formatting, whitespace, or lint-only fixes.
- Documentation prose changes.
- Dependency lockfile updates without code or test changes.

If the diff modifies application code, schemas, configuration, API routes, UI components, or tests, proceed to step 5.

### 5. Generate human QA guide artifact

Generate Artifact 2 strictly after Artifact 1 is written.

Write the artifact using `write_to_file` to the conversation artifact directory with `ArtifactMetadata` (`UserFacing: true`, `RequestFeedback: false`, and a concise summary) to render in the UI panel. Mirror the content to repository path `tmp/qa/qa-guide-<ref>.md`.

Structure Artifact 2 using the five-part blueprint:

1. **Conceptual delta and architectural rationale**: plain language explanation of what was built and why. Do not dump raw diffs or narrate code line by line.
2. **Key scenarios handled**: matrix of happy paths, edge cases, error states, and boundary conditions.
3. **Test logic deconstruction and blind spots**: for every new or modified test, document:
   - Scenario under test.
   - Concrete assertions made.
   - Dependencies or modules mocked.
   - Blind spots and what the test fails to verify (such as unverified side effects, mocked external APIs, or concurrency edge cases).
4. **Sensory and ergonomic presentation**: impact on UI rendering, responsiveness, layout, animations, CLI argument ergonomics, or terminal formatting.
5. **Step-by-step manual verification checklist**: concrete numbered tasks for the engineer with exact terminal commands, UI interaction steps, failure-injection experiments (such as killing a daemon process or simulating bad network responses), and observable criteria that automated tests and compilers cannot verify.

### 6. Deliver executive chat summary

Provide a concise chat response strictly under 150 words.

Format the summary with:
- **Review priority**: `CRITICAL` | `HIGH` | `MODERATE` | `LOW`
  - `CRITICAL`: severe standard violations, broken critical paths, or spec divergence.
  - `HIGH`: notable spec gaps, unhandled error cases, or test blind spots needing manual testing.
  - `MODERATE`: minor polish issues or smell baseline notes.
  - `LOW`: clean code pass, zero defect indicators.
- **Quality assessment**: `CLEAN` | `NEEDS_POLISH` | `DEFECTS_IDENTIFIED` | `SPEC_MISMATCH`
- Clickable markdown links to Artifact 1 and Artifact 2 (or a note explaining Artifact 2 was skipped).
- Two bullet points directing the engineer on where to focus attention during manual verification.
