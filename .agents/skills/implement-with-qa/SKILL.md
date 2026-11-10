---
name: implement-with-qa
description: Implement work, run QA, automatically fix safe defects, and report architectural trade-offs.
disable-model-invocation: true
---

# Implement with QA

Implement the requested spec or tickets using the `implement` workflow, then run the `qa` skill in diff-scoped mode.

Automatically fix all defects reported by QA that do not require user review or architectural trade-offs.

Create a markdown artifact report summarizing what was done, key decisions, intentional spec deviations with rationale, and any architectural trade-offs from QA or implementation requiring user decision. Provide a concise summary (at most 15 lines) in chat.
