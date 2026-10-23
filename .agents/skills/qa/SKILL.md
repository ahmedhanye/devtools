---
name: qa
description: Generate a pair of verification artifacts for code changes without requiring the reviewer to read code or run tests - an interactive end-to-end checklist for QA, and an architecture, diff, and logic synthesis for engineers.
disable-model-invocation: true
---

# Quality assurance

Generate two verification artifacts for a code change, branch, or pull request. The artifacts give reviewers everything they need to evaluate changes without reading raw code or running automated test suites and verification scripts.

Do not run linters, test suites, or package verification commands. The agent inspects code changes statically and synthesizes verification material.

## 1. Inspect target changes and scope

Determine the target and declared scope from the user prompt:

1. **Pull request**: If the prompt names a PR number or URL, inspect the declared intent with `gh pr view <number>` and inspect the diff with `gh pr diff <number>`.
2. **Specific commits or files**: If the prompt names a commit, ref, or file path, inspect the commit messages with `git log -1 <ref>` and inspect the diff with `git diff <ref>`.
3. **Feature or concept**: If the prompt names a feature, locate relevant commits with `git log --grep="<term>"` and inspect the diff with `git diff`.
4. **Default**: If the prompt names no target, inspect `git diff main...HEAD`.

Inspect file statistics and diff hunks:

```bash
git diff <target> --stat
```

Anchor verification to the author's declared scope in the pull request description or commit log. Never invent verification steps for features that the diff touches partially or that remain unbuilt.

Completion criterion: Target scope, commit log, and diff statistics collected.

## 2. Author verification artifacts

Create two separate session artifacts in the agent session storage directory:

1. `qa_<target_slug>.md`: Interactive end-to-end verification checklist for manual testers.
2. `engineer_<target_slug>.md`: Architectural synthesis, diff breakdown, and logic review for developers.

Use the file creation tool with artifact metadata for each document. Format both with standard markdown and link each document to its companion at the top.

### Document 1: QA checklist (`qa_<target_slug>.md`)

Write this document for a reviewer verifying the software interactively from an end-user perspective. Direct the reviewer to verify everything end-to-end without inspecting source code or architecture.

Structure the document with these parts:

1. **Header**: Link to `engineer_<target_slug>.md`, target reference or PR link, diff statistics, and declared intent in one or two sentences.
2. **Intentions and declared purpose**: State what problem the change solves and what it was intended to achieve in two or three sentences.
3. **Before and after results**: Contrast observable user-facing behavior before and after the change using a concise comparison table.
4. **End-to-end verification scenarios**: Group verification items under relevant functional areas (CLI commands, user flows, service integrations, UI viewports). Sequence items in logical execution order, placing provisioning, installation, or prerequisite steps before scenarios that depend on them. Format each item cleanly using nested lists, placing commands in fenced code blocks for one-click copying:

````markdown
- [ ] **Scenario title**
  - **Action / Command:**
    ```bash
    command --flag value
    ```
  - **Expected:** Observable result, UI element, or exit code.
````

For UI flows without a terminal command, format actions as numbered or bulleted steps instead of a code block. Never use inline backticks for executable shell commands.

Every command must run reliably when pasted into a terminal:
- Sequence prerequisites first so later commands find the assets they depend on.
- Do not strip runtime directories like `~/.bun/bin` from `PATH` when testing fallback paths or missing dependencies.
- Do not pass dummy fallback binaries, such as `/bin/sh` in place of a browser executable, that cause assertion failures.
- Use explicit flags or isolated temporary directories to test negative and fallback paths.

Reserve alert callout blocks (`> [!NOTE]`) for genuine environment constraints or gotchas. Do not add boilerplate notes explaining who the document is for.

### Document 2: Engineer synthesis (`engineer_<target_slug>.md`)

Write this document for an engineer reviewing architectural integrity, logic flow, and test coverage. Synthesize technical facts without dumping raw code files.

Structure the document with these parts:

1. **Header**: Link to `qa_<target_slug>.md`, target reference or PR link, diff statistics, and declared intent in one or two sentences.
2. **Git diff synthesis**: Group changes by module or architectural layer in a compact table. Summarize structural additions and deletions rather than listing dozens of individual files.
3. **Architectural effect**: Summarize in three or four bullet points how the change affects subsystem boundaries, Feature-Sliced Design layers, state persistence, or data contracts.
4. **Code implementation and architecture logic**: Explain operational logic, algorithmic flow, domain invariants, state machine transitions, and boundary interactions.
5. **Test scenario logic**: Synthesize the behaviors and edge cases guarded by automated tests, explaining what the assertions verify.

### Contextual diagrams

Mermaid diagrams are optional and contextual. Do not force diagrams into fixed sections or add routine sequence diagrams to test scenarios.

Include a diagram only when visual representation clarifies complex relationships:

- Use a high-level flowchart (`flowchart TD`) for multi-step data pipelines or branching subsystems.
- Use a state diagram (`stateDiagram-v2`) for complex lifecycle or state machine transitions.
- Keep all diagrams under 8 nodes so they remain legible at a glance.
- Omit diagrams entirely when text or tables explain the change clearly.

### Content rules and prohibitions

- **No content duplication**: The QA document covers user-facing end-to-end behavior only. The Engineer document covers architecture, logic flow, and test coverage only.
- **No recommendations**: Never add recommendations, suggestions, or advice for improvements.
- **No bugs or fixes**: Never report bug investigations, code smells, or remediation patches.
- **No automated test execution commands**: Never tell the reviewer to run test runners (`bun test`, `vitest`), linters, or build scripts.

Completion criterion: Both artifacts created in session storage and cross-linked.

## 3. Deliver chat pointer

Keep the chat response concise. Direct the user to both generated markdown artifacts in session storage with clickable links.

Completion criterion: Brief response with markdown links to both session artifacts sent.
