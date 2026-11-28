---
name: explain
description: Explain a concept, codebase area, or question in a visual Markdown session artifact with diagrams and grounded references.
disable-model-invocation: true
---

# Explain

Create a clear, visual Markdown artifact in the session artifact directory that answers the user's question or explains the requested topic with diagrams and verified references. Keep tracked repository files and git state unmodified.

## Workflow

1. **Ground the explanation.** Inspect relevant codebase files, root documentation, git history, or primary external sources before answering. Verify every file path, symbol name, and behavior directly instead of assuming.
   Completion criterion: Every claim, file path, and symbol planned for the explanation is verified against observed sources.
2. **Write the visual explanation artifact.** Create a GitHub Flavored Markdown (GFM) document in the session artifact directory formatted for human reading, with plain headings, short paragraphs, scannable lists or tables, and clean fenced code blocks. Keep the Markdown direct and free of visual noise such as decorative emojis, raw HTML, redundant callouts, heavy bolding, or filler text. Include these sections:
   - **Summary.** Answer the question or state the core concept in two to three plain sentences.
   - **Visual diagram.** Include one or more Mermaid diagrams (`flowchart TD`, `flowchart LR`, `sequenceDiagram`, `stateDiagram-v2`, or `classDiagram`) when architecture, control flow, data flow, or state transitions clarify the explanation. Omit diagrams when prose or a comparison table is clearer.
   - **Walkthrough.** Break down how the mechanism, subsystem, or concept works step by step, citing concrete files, symbols, or sources.
   - **Trade-offs and gotchas.** Note constraints, edge cases, or design trade-offs relevant to the question. Omit this section when none apply.
   - **References.** List the inspected repository files or external sources backing the explanation.

   Completion criterion: The visual explanation artifact is written in clean, human-readable GFM to the session artifact directory.

3. **Link the explanation in chat.** Share a clickable link to the artifact and a two to three sentence takeaway without repeating the full artifact contents in chat.
   Completion criterion: Chat reply links the artifact and summarizes the main answer.
