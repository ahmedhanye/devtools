---
name: refactor-code
description: Audit production code, standards, docs, and comments to surface code-level simplifications, pattern improvements, package changes, and lint gaps in a Markdown report.
disable-model-invocation: true
---

# Refactor code

Audit production code for code-level quality and refactoring opportunities, focusing on implementation, patterns, dependencies, and lint hygiene rather than system architecture or tests. Prioritize runtime code that directly affects production behavior; skip tests, generated files, and non-production helpers or scripts. Keep repository files unmodified during analysis and reporting.

## Process

### 1. Analyze code, standards, docs, and comments

1. **Load local context.** Read `CODING_STANDARDS.md`, `REVIEW.md`, linked coding guides, project manifests, linter/static-analysis configs, and baseline files for the target scope.
2. **Set scope.** Target the user's named files or area; otherwise combine the highest-churn production files (`git log -n 100 --name-only --pretty=format:`) with baselined complexity or duplication hotspots. Focus exclusively on code that affects production runtime, excluding tests, generated artifacts, and dev/build/internal helper scripts.
3. **Collect signals and read full files.** Run existing read-only linters and static analyzers (complexity, duplication, dead code, suppressions) and inspect installed lint plugins against the main verification script. Read the scoped production files, inline comments, and suppression comments in full.

Completion criterion: Standards, configs, static-analysis outputs, and full scoped production files (including comments and suppressions) are collected and read, with non-production helpers and tests excluded.

### 2. Research gaps, patterns, and package changes

Investigate the analyzed production code (verifying external packages, APIs, and lint rules against live primary sources) across five lenses:

1. **Simplification and over-engineering:** Convoluted control flow, speculative abstractions, unnecessary indirection, or verbose logic that can achieve the same behavior with less code and overhead, while preserving clarity over cleverness.
2. **Design patterns and mistakes:** Language or framework anti-patterns, subtle bugs, redundant work, or drift from `CODING_STANDARDS.md` and docs.
3. **Packages to install or uninstall:** Unused, overlapping, or under-used production dependencies to remove, and non-trivial hand-rolled infrastructure (such as caching, retries, state sync, or parsing) where an established package clearly lowers maintenance cost. Prefer already-installed workspace dependencies first.
4. **Lint rules and suppressions:** Missing high-value lint rules, installed plugins not wired into verification, and production lint or type suppression comments removable by fixing the underlying code.
5. **Baselined debt:** Existing baselined complexity or duplication hotspots in production code worth paying down now.

Discard cosmetic nits, speculative rewrites, and findings confined to non-production helpers; keep only findings backed by exact file paths and clear leverage.

Completion criterion: All five lenses are evaluated against the scoped production files, external package or rule claims are verified against primary sources, and low-leverage or non-production findings are pruned.

### 3. Write the Markdown artifact

Write `refactor_code_<scope>.md` in the session artifact directory using the format below. Link the artifact in chat with the summary table and top recommendation, ask `"Which improvement(s) would you like to apply?"`, and end your turn.

Completion criterion: `refactor_code_<scope>.md` is written to the session artifact directory, linked in chat with its summary table, and all repository files remain untouched.

## Report format

```markdown
# Refactor code: <repo or scope>

**Date:** <YYYY-MM-DD> | **Scope:** <files or areas> | **Findings:** <count>

|  #  | Improvement                    | Category                                             | Impact | Effort |
| :-: | :----------------------------- | :--------------------------------------------------- | :----: | :----: |
|  1  | [<Short title>](#1-title-slug) | Simplification \| Pattern \| Package \| Lint \| Debt |  High  |  Low   |

---

## 1. <Short title>

**Category:** <Simplification | Pattern | Package | Lint | Debt> | **Impact:** <High | Medium> | **Effort:** <Low | Medium | High>

- **Gap:** <1 to 2 sentences on the current production code, mistake, overhead, or unused/missing package.>
- **Improvement:** <1 to 2 sentences on the cleaner implementation, pattern, package change, or lint rule.>
- **Files:** `path/to/a.ts`, `path/to/b.ts`

---

> [!TIP]
> **Top recommendation:** Start with **#1 (<Short title>)** because <1 concise sentence on impact vs. effort>.
```
