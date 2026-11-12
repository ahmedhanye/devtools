---
name: writing-docs
description: "Write, structure, and update project documentation across root *.md and docs/**. Use when writing, editing, or restructuring READMEs, guides, coding standards, architecture, testing, contributing, review, or security docs."
---

# Writing documentation

Authoring guide for repository documentation across `docs/**`, package and app READMEs, and root `*.md` files: `README.md`, `ARCHITECTURE.md`, `CODE_OF_CONDUCT.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md`, `GLOSSARY-MAP.md`, `REVIEW.md`, `SECURITY.md`, and `TESTING.md`.

Apply [`/unslop`](../unslop/SKILL.md) to all prose.

## Core authoring principles

- **Lead with a summary.** Open with one or two sentences stating what the document covers and when it applies.
- **Write for every reader.** Author root `*.md` and `docs/**` files uniformly so humans and coding agents follow the exact same procedures. Omit agent-specific mechanics such as `subagent`, `coordinator`, `prompt`, `token`, or `turn` outside `.agents/`.
- **Keep one source of truth.** Record each contract, procedure, or table in one canonical file and link to it elsewhere instead of duplicating text.
- **Point to code instead of copying it.** Reference repository-relative paths such as `path/to/file.ext#L10-L25` and symbol names such as `ClassName.method`. Keep inline code to short syntax or usage examples.
- **Format structured data in tables.** Put CLI flags, configuration fields, environment variables, schemas, and error codes in Markdown tables instead of prose lists.
- **Express architecture in Mermaid.** Use Mermaid code blocks for workflows, lifecycles, and component interactions so diagrams stay text-diffable.
- **Match the repository layout.** Keep root index files concise, place detailed topic guides under `docs/**`, and update parent index links when adding, renaming, or removing files.

## Verification

Confirm that Markdown or MDX are 100% valid, and verify all links, file paths, symbol references, and documented facts against the codebase.
