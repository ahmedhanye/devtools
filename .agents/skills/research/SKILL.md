---
name: research
description: Investigate architecture, API contracts, dependencies, or security practices in a dedicated subagent. Use when researching technical questions, comparing libraries, or verifying external documentation.
---

# Research

Investigate technical questions against primary sources, verify facts across code and documentation, and record findings in a markdown report.

## Rules

1. **Subagent isolation.** Multi-step research runs in a dedicated subagent to keep the main conversation context clean. The foreground session defines the question and dispatches the subagent. The subagent performs the search, reading, and verification.
2. **Mandatory web search for external topics.** When questions touch external libraries, APIs, security advisories, or ecosystem practices, the subagent runs live web searches. Do not rely on training memory for external library contracts or versions.
3. **Primary sources over secondary summaries.** Treat source code, compilers, runtime output, official specifications, and release notes as ground truth. Quarantine third-party blog posts and forum comments.
4. **Current state before proposals.** Document how the system currently works before suggesting changes.
5. **Search for counter-evidence.** Search for contrary facts, deprecation notices, version mismatches, and edge cases.

## Workflow

### 1. Foreground coordinator

When running in the primary session:

1. Frame 1 to 3 concrete questions from the prompt and referenced files. Do not run web searches, read deep code paths, or execute commands in the primary session.
2. Dispatch a dedicated subagent with `invoke_subagent`. Pass:
   - `TypeName`: `self`
   - `Role`: `Technical Researcher`
   - `Prompt`: Include the scoped questions, relevant repository paths, instruction to search the web for external documentation, and target report path `.scratch/research/<topic>.md` following [TEMPLATE.md](TEMPLATE.md).
3. Stop tool execution immediately. The system resumes execution when the subagent finishes.
4. When resumed, read `.scratch/research/<topic>.md`.
5. Present a direct answer to the user in under 300 words, cite key trade-offs, and link to `.scratch/research/<topic>.md`.

Completion criterion: The foreground session dispatches the subagent, halts tool calls, and presents a final summary linked to `.scratch/research/<topic>.md` upon resumption.

### 2. Subagent researcher

When running inside the dispatched subagent:

1. Search external documentation. When questions involve third-party libraries, APIs, or security advisories, use `search_web` to retrieve first-party documentation, specifications, and release notes. Record exact URLs and versions.
2. Inspect codebase evidence. Find relevant symbols, types, tests, and configuration files. Record repository-relative paths and line numbers.
3. Verify empirical behavior. When static documentation is ambiguous, verify behavior with CLI `--help` flags or existing test suites.
4. Cross-check version compatibility. Verify that external documentation matches the package versions in `package.json` or lockfiles.
5. Write the research report. Create `.scratch/research/<topic>.md` following [TEMPLATE.md](TEMPLATE.md). Fill all sections.
6. Return a completion message summarizing findings and confirming the report path.

Completion criterion: The report file exists at `.scratch/research/<topic>.md` with all template sections completed, and the subagent sends a completion message.
