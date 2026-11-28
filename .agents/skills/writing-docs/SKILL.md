---
name: writing-docs
description: "Write, structure, and update Engineering Docs across root *.md and docs/**. Use when writing, editing, restructuring, or syncing READMEs, guides, coding standards, architecture, testing, contributing, review, or security docs, including doc updates after code, CI, or workflow changes."
---

# Writing documentation

Authoring guide for **Engineering Docs** across `docs/**`, package and app READMEs, and root `*.md` files (`README.md`, `ARCHITECTURE.md`, `CODE_OF_CONDUCT.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md`, `GLOSSARY.md`, `REVIEW.md`, `SECURITY.md`, and `TESTING.md`).

Apply [`/unslop`](../unslop/SKILL.md) to all prose. For Architecture Decision Records (`docs/adr/`) and the domain glossary (`GLOSSARY.md`), read and follow [`domain-modeling`](../domain-modeling/SKILL.md) and obtain explicit maintainer confirmation before authoring or editing any ADR.

## Core authoring principles

- **Lead with a summary.** Open every file with one or two sentences stating what the document covers and when it applies.
- **Write human-first engineering prose.** Author root `*.md`, `docs/**`, and READMEs uniformly so humans and coding agents follow the exact same procedures. Omit agent-harness mechanics such as `subagent`, `coordinator`, `prompt`, `token`, `turn`, or "run in another session" from project documentation.
- **Verify facts against live code first.** Read live source files, manifests, configs, and CLI `--help` output before writing or updating claims. Ban volatile literals that silently rot, such as patch version strings, hardcoded CI check counts, terminal directory listings, or file-by-file ASCII trees.
- **Keep one source of truth.** Record each contract, table, diagram, or procedure in one canonical file and link to it elsewhere. Maintain clear folder ownership: architecture docs own topology, data flow, and lifecycles (_how it works_); coding standards own authoring rules and checklists (_how to write it_); testing and contributing docs own verification and workflow procedures.
- **Point to code instead of copying it.** Reference repository-relative paths (`path/to/file.ext#L10-L25`) and exported symbol names (`ClassName.method`) instead of pasting full files or functions. Keep inline snippets to short 5 to 12 line syntax or pattern skeletons.
- **Use canonical domain language.** Reuse exact terms from `GLOSSARY.md` and replace synonyms listed under `_Avoid_`.

## Token efficiency and structure

- **Keep root indexes thin.** Root `*.md` files act as hub-and-spoke maps: a short overview, core invariants, and a `When to read` routing table pointing to topic guides under `docs/**` so readers open only the single file they need.
- **Front-load answers and cut generic prose.** Place decision tables, commands, and hard constraints before background rationale. Document only repository-specific contracts, trade-offs, and non-obvious constraints rather than textbook explanations any engineer already knows.
- **Co-locate and split cleanly.** Group a contract's definition, rules, and edge cases under one concrete, searchable heading (for example, `## Loopback security boundary` instead of `## Security`). Split a guide only when it serves distinct workflows or grows dense past ~150 lines; place shared rules in a parent guide and branch-specific procedures in sibling files under a matching subfolder.
- **Maintain link hygiene during restructures.** When creating, renaming, splitting, merging, or deleting any file, update every incoming link and `#heading` anchor across root `*.md`, `docs/**`, and package or app READMEs, leaving zero orphan documents.

## Visuals and formatting

- **Format structured data in tables.** Put CLI commands, flags, environment variables, folder responsibilities, status codes, schemas, and commit matrices in Markdown tables instead of prose lists.
- **Use GitHub Flavored Markdown features purposefully.** Use language-tagged fenced code blocks, task lists (`- [ ]`, `- [x]`) for checklists, relative file and `#heading` links, footnotes for secondary citations, and collapsible `<details>` sections only for optional reference details while keeping required rules and specs visible inline. Use GitHub Alerts (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`) at most once or twice per file, never nested or stacked consecutively, to highlight security boundaries, irreversible actions, traps, and superseded-doc notices.
- **Express flows in Mermaid.** Use `flowchart` for topology and decisions, `sequenceDiagram` for protocols and lifecycles, and `stateDiagram-v2` for state machines. Keep diagrams readable (~10 to 12 nodes maximum), quote labels containing special characters (`()`, `[]`, `/`, `:`), and never duplicate the same diagram across two files.

## Verification

Before finishing any documentation edit, confirm all of the following:

1. Every modified file passes [`/unslop`](../unslop/SKILL.md) (sentence-case headings, no em dashes, plain active voice) and contains zero agent-harness leakage.
2. Every documented fact, CLI flag, script name, file path, symbol, relative link, and `#heading` anchor is verified against live files in the repository.
3. No duplicated sections or volatile code copies were introduced across sibling docs, and all incoming links to moved or removed files are updated.
4. The repository's Markdown formatter or linter exits `0` on all modified files.
