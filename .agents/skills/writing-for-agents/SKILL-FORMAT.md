# Skill format

Skill-specific rules for [`writing-for-agents`](SKILL.md), covering `SKILL.md` frontmatter, invocation modes, skill splitting, and bundled scripts.

## Frontmatter requirements

Every `.agents/skills/<name>/SKILL.md` must start with a YAML frontmatter block delimited by `---`.

- **`name`.** Required string that must match the `<name>` directory name for all repository and custom skills.
- **`description`.** Required string of at least 10 characters. Keep model-invoked descriptions within roughly 60 to 100 tokens using the `<What it does>. Use when <distinct trigger branches>.` pattern. Quote any description that contains a colon so YAML parsing succeeds.
- **`disable-model-invocation`.** Optional boolean that controls whether the agent loads the description into context.

## Invocation modes

Choose between model invocation and user invocation based on who triggers the skill.

- **Model-invoked skills.** Omit `disable-model-invocation`. Both the agent and the user can invoke the skill, and other skills can reference it. Because the `description` loads into context automatically on every turn, write it using the context pointer rules in `SKILL.md` and never add duplicate pointers to the skill inside `.agents/AGENTS.md` or `.agents/rules/*.md`. A model-invoked reference skill can also hold shared rules that multiple skills consult.
- **User-invoked skills.** Set `disable-model-invocation: true`. Only the user typing `/<name>` can invoke the skill, spending zero context tokens per turn. Write a concise one-sentence `description` for the human without `Use when...` trigger branches.
- **Shared reference for user-invoked skills.** Two user-invoked skills cannot invoke each other automatically. Place shared reference in a standalone Markdown file or a model-invoked skill that both skills link to.

## Splitting by invocation and router skills

- **Split by invocation.** Extract a separate model-invoked skill only when a distinct trigger phrase in user prompts or another skill needs to load that material independently. Every new model-invoked skill adds permanent context load through its `description`.
- **Router skills.** When many user-invoked skills accumulate, create one user-invoked router skill that lists the related skills and when to run each so the human only remembers one entry point.

## Bundled scripts in `scripts/`

Place deterministic validation, lookup, or transformation logic in `.agents/skills/<name>/scripts/` so the agent executes the script via CLI without loading implementation code into the context window.

- **Executable permissions.** Include a shebang such as `#!/usr/bin/env bun` or `#!/usr/bin/env bash` and mark the file executable with `chmod +x`.
- **Non-interactive CLI.** Accept explicit file or flag arguments and exit `0` on success or non-zero with actionable error messages on failure. Never prompt for interactive TTY input.
- **Documented invocation.** Show the exact command line and exit-code completion criterion inside `SKILL.md`.
