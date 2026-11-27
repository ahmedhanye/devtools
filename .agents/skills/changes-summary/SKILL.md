---
name: changes-summary
description: Summarize repository changes in a visual Markdown session artifact with diagrams, decisions, and verification status.
disable-model-invocation: true
---

# Changes summary

Create a clear, visual Markdown artifact in the session artifact directory explaining what changed, why decisions were made, and how the changes were verified. Keep tracked repository files and git state unmodified.

## Workflow

1. **Inspect the change scope.** Default to the current branch commits plus uncommitted working-tree changes against the base ref, falling back to uncommitted working-tree changes when on the base branch. When the user names a specific pull request, commit range, or file list, inspect that target instead.
   Completion criterion: Changed files, diff statistics, and relevant commits or working-tree edits are inspected.
2. **Write the visual summary artifact.** Create a Markdown document in the session artifact directory with the following sections:
   - **Overview.** State the goal and scope in two to three plain sentences.
   - **Visual flow.** Include a Mermaid diagram (`flowchart TD`, `flowchart LR`, or `sequenceDiagram`) showing how modified modules, data flow, or workflows connect whenever the change spans multiple modules or layers.
   - **Grouped changes.** Organize modified, added, and deleted files by logical area or responsibility with concise notes on what changed and why.
   - **Decisions and verification.** List key design decisions, any intentional deviations from the original request with rationale, and the verification commands run with their exit status.
   - **Manual checks.** List exact UI views, stories, routes, or interactive checks to verify manually when automated tests cannot cover them. Omit this section when automated checks verified all modified behavior.
     Completion criterion: The visual summary Markdown artifact is written to the session artifact directory.
3. **Link the summary in chat.** Share a link to the artifact and a brief overview of the headline changes without repeating the full artifact contents in chat.
   Completion criterion: Chat reply links the artifact and summarizes the main outcomes.
