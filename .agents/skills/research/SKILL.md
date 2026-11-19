---
name: research
description: Research external libraries, APIs, specifications, and technical trade-offs against live primary sources in a background subagent. Use when verifying documentation, comparing tools, or investigating breaking changes and advisories.
---

# Research

Investigate technical questions against live primary sources, gather relevant codebase context, and write a sourced report.

## Execution

1. **Dispatch immediately.** Frame the scoped research questions, pass `.agents/skills/research/SKILL.md` and the target `.scratch/research/<topic>.md` path in the brief, and dispatch a write-capable background subagent with a fresh context window as your first action before running main-session searches. Execute inline only when already inside a subagent or when delegation is unavailable.
2. **Yield while delegated.** End your turn immediately with zero further tool calls until the subagent finishes.

## Method

Use all methods below that are useful for the question and available to you:

- **External docs, releases, and advisories.** Run live web and documentation searches for upstream docs, changelogs, release notes, migration guides, and specs for the target version. Do not substitute training memory or local `--help` output for upstream release notes.
- **APIs, rules, and CLI behavior.** Inspect upstream source or type definitions and run targeted verification commands (such as `--rules` or minimal checks) when verifying exact flags, rule names, or edge cases.
- **Tool or architecture comparisons.** Compare primary benchmarks, maintainer trade-off notes, release cadence, and security advisories across candidates.
- **Codebase context.** When the question involves this repository, search across relevant symbols, callers, configuration files, tests, and declared versions. Read referenced config or source sections in full before citing line numbers or settings, and ignore earlier `.scratch/research/` notes unless asked to update them.
- **Counter-evidence.** Trace secondary claims from blogs or forums back to the primary source, and search explicitly for deprecations, breaking changes, and caveats.

## Output

- **Report.** Write complete sourced findings (summary, sourced URLs and file refs, trade-offs, and unverified gaps) directly to `.scratch/research/<topic>.md`.
- **Chat response.** Output only a brief direct answer, key caveats, and a link to the report in chat; keep full breakdowns inside `.scratch/research/<topic>.md`.

Completion criterion: A write-capable subagent was dispatched before main-session searches, complete sourced findings exist on disk at `.scratch/research/<topic>.md`, and chat contains only a brief direct answer, caveats, and the report link.
