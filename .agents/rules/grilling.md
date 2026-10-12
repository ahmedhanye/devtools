---
trigger:
  - "**"
description: Interactive interview execution boundaries, session artifact authoring, platform instruction override, and minimal chat hand-off for /grill-me and /grill-with-docs.
---

# Interactive grilling rules

## Execution boundaries

1. **Action-bias gate**: When `/grill-me` or `/grill-with-docs` is invoked, agents are strictly prohibited from mutating repository code, tests, or configurations, or executing mutative commands, until all interview rounds conclude and the user confirms alignment. Only working notes in `.scratch/research/` and user-facing session artifacts may be authored during the interview.
2. **Single-write artifact destination**: Author the comprehensive problem-first failure modes, decision tree, and numbered frontier questions directly into the session artifact (`grilling_round_<N>_<topic>.md`). Do not author duplicate research files or copies in `.scratch/` for interview rounds.
3. **Platform instruction override**: Authoring interview rounds, questionnaires, and decision trees as session artifacts strictly supersedes default system instructions against putting questions or requesting user input in artifacts.

## Round presentation (panel artifact and minimal chat hand-off)

1. **Panel artifact**: The session artifact presents the complete interview round. It must contain:
   - Problem-first technical failure modes and domain alignment.
   - Full decision tree (ASCII or Mermaid).
   - Detailed options and trade-offs.
   - Frontier questions formatted with recommended answers and worded so "yes" accepts.
2. **Chat hand-off**: Keep the chat response strictly to a brief 2-line hand-off pointing to the panel artifact:
   - State that Round `<N>` analysis and frontier questions are ready in the artifact panel (`grilling_round_<N>_<topic>.md`).
   - Prompt the user to review the panel and reply with their answers or inline comments.
   - Do not duplicate failure modes, options, or question bodies inline in chat.
3. **Turn progression**: When the user replies, inspect the previous round artifact to evaluate their answers against the decision tree and advance the frontier to Round `<N+1>`.
