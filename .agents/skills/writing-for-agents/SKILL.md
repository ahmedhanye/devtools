---
name: writing-for-agents
description: Write and maintain agent instructions, rules, and skills. Use when creating, editing, or reviewing .agents/AGENTS.md, .agents/rules/*.md, or .agents/skills/.
---

# Writing for agents

Reference and workflow for authoring any document an agent reads in this repository, including `.agents/AGENTS.md`, `.agents/rules/*.md`, `.agents/skills/<name>/SKILL.md`, and linked reference files.

Apply [`/unslop`](../unslop/SKILL.md) to all prose for sentence-level clarity and formatting rules. When creating or editing a skill, also read [`SKILL-MECHANICS.md`](SKILL-MECHANICS.md) for frontmatter, invocation modes, bundled scripts, and lockfile management.

## Budgets and three-tier progressive disclosure

Every instruction spends one of two budgets.

- **Context load.** Always-loaded text in `.agents/AGENTS.md`, active rule headers, and model-invoked skill descriptions consumes tokens and attention on every turn. Frontier models reliably follow roughly 150 to 200 instructions across the active context window before adherence drops.
- **Cognitive load.** User-invoked skills and unindexed docs cost zero tokens until called, but require the human to remember when to invoke them.

Place each instruction on the lowest tier of the `.agents/` hierarchy that still triggers reliably when needed.

1. **Tier 1, always-loaded root and routing metadata.** `.agents/AGENTS.md` loads on every turn alongside model-invoked `SKILL.md` frontmatter, where `name` and `description` cost roughly 60 to 100 tokens per skill. Restrict `.agents/AGENTS.md` to universal execution boundaries and high-signal context pointers that apply to every task.
2. **Tier 2, conditionally loaded rules and skill bodies.**
   - **Scoped rules in `.agents/rules/*.md`.** Move domain, package, or file-specific rules out of `.agents/AGENTS.md` and into `.agents/rules/*.md` gated by YAML frontmatter. Each rule requires a single glob string `trigger` such as `"{package.json,bun.lock}"` and a `description` of at least 10 characters. Never use a YAML array for `trigger`.
   - **Skill bodies in `.agents/skills/<name>/SKILL.md`.** Loaded on demand when triggered, holding ordered **steps** and core **reference** needed by every run of the skill.
3. **Tier 3, disclosed references and executable scripts.** Push branch-specific reference into sibling Markdown files such as `references/*.md` behind a pointer. Move deterministic validation, parsing, or lookup logic into executable scripts under `scripts/` so the agent runs the CLI without loading script source code into the context window.

**Co-location.** Group a concept's definition, rules, and edge cases under one heading so reading that section loads the complete contract. Scattering one rule across multiple headings fragments attention, while repeating the same rule across files creates drift.

## Context pointers

A **context pointer** is an always-loaded line that names an out-of-context file and states when to read it, such as a model-invoked skill `description`, a rule `description`, or a pointer to a repository document (`TESTING.md`, `ARCHITECTURE.md`). The pointer's wording determines whether the agent reaches the target file. When an agent misses a document, sharpen the pointer wording before inlining the target material.

- **Front-load trigger terms.** Format descriptions as `<What it does>. Use when <distinct trigger branches>.` so the primary action and domain nouns appear in the first clause.
- **Keep one trigger per branch.** A branch is a distinct scenario the target document handles. Collapse synonyms that describe the same scenario into one trigger phrase.
- **Omit body details.** State what the target file covers and when to load it, leaving implementation steps to the target file.
- **No duplicate pointers for auto-loaded files.** `.agents/AGENTS.md`, active rule headers, and model-invoked skill `description` fields load into context automatically on every turn. Never add pointers to model-invoked skills, rules, or `.agents/AGENTS.md` inside `.agents/AGENTS.md` or `.agents/rules/*.md`.

## Steps and completion criteria

End every procedural step or workflow with a checkable, exhaustive **completion criterion**.

- **Clarity.** State an observable condition that distinguishes done from not-done, such as a script exiting `0` or a report written to a target path. Vague criteria invite premature completion when later steps remain visible in context.
- **Demand.** Specify exhaustive scope, such as verifying every modified file or checking every checklist item, to require thorough investigation before advancing.
- **Sequence splitting.** Sharpen completion criteria first when an agent rushes a step. If visible follow-up steps still pull attention forward, split the sequence across a subagent or handoff boundary so later steps stay out of context until the current step finishes.

## Leading words, positive framing, and structural encoding

- **Leading words.** Reuse compact domain terms from pretraining to anchor behavior across prompts, pointers, and steps without repeating multi-sentence definitions. Replace "fast, deterministic, low-overhead" with _tight_, and replace "a test that fails on the bug" with _red_.
- **Positive instructions.** State the target behavior directly rather than naming forbidden behavior. Prohibitions activate the banned pattern in context. Reserve negative rules for hard safety boundaries and pair each prohibition with the positive action to take.
- **Encode lessons in scripts.** When a recurring rule can be verified deterministically, encode it in an executable script under `<skill>/scripts/` or a repository lint check rather than adding prose warnings. Every bundled script must be executable with `chmod +x` and have its exact CLI invocation and exit-code completion criterion documented in `SKILL.md`.

## Pruning

- **Brevity is the soul of wit.** Target 30 to 80 lines for focused skills, treating 500 lines as a hard ceiling for complex multi-step workflows. Cut any sentence that does not change agent behavior.
- **Single-concern scope.** Restrict each skill or rule to its own domain. Never include git, pull request, ticketing, or unrelated workflow instructions inside a domain skill.
- **Single source of truth.** State each rule once at the boundary where it applies. Reference any skill, rule, or document at most once per file without repeating the link across sections or copying its rules into the body.
- **No environment caching.** `package.json` scripts, directory layouts, config files, and CLI `--help` output are live sources of truth. Document only unwritten conventions, architectural trade-offs, and non-obvious constraints that the agent cannot inspect directly.
- **File pointers over code copies.** Point to repository-relative file paths instead of pasting codebase snippets into instructions where they go stale.
- **No-op and stale line removal.** Delete instructions that the model already obeys by default or that reference obsolete files and workflows.
- **Repository-relative paths.** Reference tracked files with repository-relative paths. Never commit absolute filesystem paths or `file://` URIs in `.agents/` documents.

## Verification workflow

Run these steps whenever creating or modifying `.agents/AGENTS.md`, `.agents/rules/*.md`, `.agents/skills/**/*.md`, or `skills-lock.json`.

1. **Run governance verification.** Execute the bundled validator to check YAML frontmatter, code fences, path portability, local Markdown links, and unslop punctuation rules.
   ```bash
   bun .agents/skills/writing-for-agents/scripts/verify-agents-governance.ts
   ```
   Pass specific file paths during iterative edits, or run `bun run lint:agents` to validate all `.agents/` Markdown files.
2. **Check formatting.** Verify Markdown and JSON formatting with Prettier.
   ```bash
   bunx prettier --check .agents/
   ```

Completion criterion: All modified `.agents/` files pass unslop prose review, `bun .agents/skills/writing-for-agents/scripts/verify-agents-governance.ts` exits `0`, and `bunx prettier --check .agents/` exits `0`.
