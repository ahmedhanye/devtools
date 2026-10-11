---
name: documentation-authoring
description: Author technical documentation for the documentation platform (site/). Use when writing Fumadocs MDX across Diátaxis quadrants.
---

# Documentation authoring

Author technical documentation for the documentation platform (`site/`, `@devtools/site`) using Diátaxis quadrants and Fumadocs MDX.

## Context pointers

- **Diátaxis blueprints**: Read [.agents/skills/documentation-authoring/references/diataxis-quadrants.md](.agents/skills/documentation-authoring/references/diataxis-quadrants.md) for quadrant specifications, structural templates, and content boundaries.
- **Fumadocs reference**: Read [.agents/skills/documentation-authoring/references/fumadocs-features.md](.agents/skills/documentation-authoring/references/fumadocs-features.md) for MDX components, Shiki code highlighting, styling tokens, accessibility standards, and compilation diagnostics.
- **Verification rules**: Consult [.agents/rules/verification.md](.agents/rules/verification.md) for compiler verification commands and test invariants.
- **Domain vocabulary**: Read [.agents/GLOSSARY.md](.agents/GLOSSARY.md) for platform terminology standards.

## Authoring workflow

Follow these steps in order when creating or editing documentation.

### 1. Determine quadrant and destination path

1. Map reader intent to a single Diátaxis quadrant:
   - Tutorials (`site/content/docs/tutorials/<topic>.mdx`): learning through practical action for beginners.
   - How-to guides (`site/content/docs/how-to/<topic>.mdx`): solving a targeted practical problem.
   - Reference (`site/content/docs/reference/<topic>.mdx`): factual lookup of technical specifications.
   - Explanation (`site/content/docs/explanation/<topic>.mdx`): architectural context and rationale.
2. Select the destination file path under the designated quadrant folder.
3. Completion criterion: The target file path sits inside the designated quadrant folder and adheres to a single pedagogical orientation without blending quadrants.

### 2. Configure frontmatter

1. Add YAML frontmatter bounded by `---` at the beginning of the file.
2. Provide sentence case `title` and a concise `description` summarizing document purpose.
3. Add optional Lucide `icon` if the page acts as a section navigation root.
4. Completion criterion: Frontmatter contains non-empty `title` and `description` strings without leading whitespace.

```yaml
---
title: Start the local daemon
description: Configure runtime parameters and start the local background daemon.
---
```

### 3. Structure document headings and sections

1. Apply the required section structure for the target quadrant defined in [.agents/skills/documentation-authoring/references/diataxis-quadrants.md](.agents/skills/documentation-authoring/references/diataxis-quadrants.md).
2. Start body headings with level 2 (`##`). Fumadocs generates the level 1 heading from frontmatter `title`.
3. Apply sentence case to all headings.
4. Maintain strict hierarchy without skipping levels (`##` followed by `###`, never `####` directly under `##`).
5. Completion criterion: The document body contains zero level 1 (`#`) headings, zero skipped heading levels, and implements all mandatory sections required by the target quadrant blueprint.

### 4. Author MDX content with Fumadocs components

1. Consult [.agents/skills/documentation-authoring/references/fumadocs-features.md](.agents/skills/documentation-authoring/references/fumadocs-features.md) for component usage, syntax highlighting, and layout patterns.
2. Specify language tags on every fenced code block (`bash`, `ts`, `tsx`, `json`, `yaml`, `text`).
3. Add `title="path/to/file"` on code blocks representing repository files or terminal commands.
4. Maintain visual rhythm. Prevent continuous prose walls exceeding three paragraphs by using `<Steps>`, `<Tabs>`, `<Cards>`, `<Files>`, `<TypeTable>`, or Mermaid diagrams.
5. Import Fumadocs components directly from `fumadocs-ui/components/<name>`.
6. Completion criterion: Every fenced code block specifies a language identifier, all JSX tags close cleanly, and continuous prose blocks do not exceed three paragraphs.

### 5. Validate presentation and accessibility invariants

1. Provide descriptive alt text for every image explaining its content and function.
2. Write descriptive link text identifying the destination resource. Never use generic labels ("click here", "here", "link") or bare URLs.
3. Reference repository files and paths relative to the repository root. Never write absolute machine paths.
4. Follow instruction hygiene. Eliminate AI tells, fancy synonyms for "is", and mid-sentence colons. Use commas or periods instead of em dashes.
5. Completion criterion: The document contains zero missing alt attributes, zero generic link labels, zero em dashes, and zero absolute machine paths.

### 6. Verify documentation changes

1. Run the change-scoped verification commands defined in [.agents/rules/verification.md](.agents/rules/verification.md) for documentation content.
2. Resolve any MDX compilation, broken link, or syntax diagnostics using the troubleshooting guide in [.agents/skills/documentation-authoring/references/fumadocs-features.md](.agents/skills/documentation-authoring/references/fumadocs-features.md).
3. Completion criterion: Verification commands specified in [.agents/rules/verification.md](.agents/rules/verification.md) exit with code 0 without errors or broken links.
