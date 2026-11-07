---
name: writing-docs
description: "Author, structure, and synchronize technical documentation for human engineers and AI coding agents. Use when writing, editing, restructuring, or updating READMEs, architectural docs, guides, or API reference files."
---

# Writing documentation

Reference and authoring guide for writing clear, token-efficient technical documentation for human engineers and AI coding agents.

Apply [`/unslop`](../unslop/SKILL.md) to all prose.

## Core authoring principles

Every document should serve both visual human comprehension and agent token efficiency.

- **Lead with an executive summary.** Open with a brief summary or bulleted contract stating what the component or subsystem does. Humans scan this in 15 seconds; agents retrieve it without loading the whole file.
- **Express architecture in Mermaid.** Use plain-text Mermaid diagrams for workflows, lifecycles, and component interactions. They render visually for developers, parse cleanly as graphs for models, and cost far fewer tokens than ASCII art.
- **Format relational data in tables.** Structure CLI flags, configuration parameters, environment variables, schema fields, and error codes into Markdown tables rather than narrative paragraphs.
- **Use code pointers over code copies.** Direct readers to repository-relative file paths (`path/to/file.ext#L10-L25`) and symbol names (`ClassName.method`). Inlined code belongs only in minimal syntax examples (one to three lines). Code copies rot when source code changes.
- **Progressive disclosure.** Keep root index files lean as navigation pointers. Keep topic documents cohesive and bounded under a centralized documentation path such as `docs/`.

## When to update documentation

Update existing documentation when code changes alter:

- Exported API signatures, parameters, types, or return values.
- Configuration schemas, environment variables, or default settings.
- CLI flags, arguments, commands, or exit codes.
- System components, runtime lifecycles, or architectural invariants.

When adding, moving, or deleting documentation files, update parent table-of-contents links and prune broken references.

## Verification

Before finishing documentation edits:

1. Confirm all code fences are closed and declare a language tag.
2. Confirm relative Markdown links point to existing files and valid anchors.
3. Confirm all paths are repository-relative, with no machine-specific paths (`/home/`, `/Users/`, `file:///`).

Completion criterion: Modified documentation reads clearly, contains valid links and closed fences, uses code pointers over copies, and passes repository lint checks.
