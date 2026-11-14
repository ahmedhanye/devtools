---
name: research
description: Research external libraries, APIs, specifications, and technical trade-offs against live primary sources in a background subagent. Use when verifying documentation, comparing tools, or investigating breaking changes and advisories.
---

# Research

Investigate technical questions against live primary sources, gather relevant codebase context, and write a sourced report.

## Execution

Dispatch a background subagent with a fresh context window immediately without running preliminary searches in the main session. Execute inline only when already inside a subagent or when the caller forbids delegation.

## Method

Combine every applicable method below to gather primary evidence:

- **External docs, releases, and advisories.** Run live web and documentation searches for upstream docs, changelogs, release notes, migration guides, and specs for the target version. Do not substitute training memory or local `--help` output for upstream release notes.
- **APIs, rules, and CLI behavior.** Inspect upstream source or type definitions and run targeted verification commands (such as `--rules` or minimal checks) when verifying exact flags, rule names, or edge cases.
- **Tool or architecture comparisons.** Compare primary benchmarks, maintainer trade-off notes, release cadence, and security advisories across candidates.
- **Codebase context.** When the question involves this repository, search across relevant symbols, callers, configuration files, tests, and declared versions. Read referenced config or source sections in full before citing line numbers or settings, and ignore earlier `.scratch/research/` notes unless asked to update them.
- **Counter-evidence.** Trace secondary claims from blogs or forums back to the primary source, and search explicitly for deprecations, breaking changes, and caveats.

## Output

- **Report.** Create `.scratch/research/<topic>.md` when starting the investigation and append sourced findings with exact URLs and file references as each section is verified, preserving evidence on disk across long runs. Finalize the report with an answer summary, trade-offs, and unverified gaps.
- **Chat response.** Output only a brief summary in chat with the direct answer and key caveats, and link to the report.
