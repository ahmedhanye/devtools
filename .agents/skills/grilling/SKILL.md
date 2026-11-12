---
name: grilling
description: Interview the user in rounds along a design tree to settle every open decision in a plan, design, or idea. Use when stress-testing thinking, resolving design trade-offs, or asked to grill an idea.
---

Interview the user in rounds along a design tree until every open decision has an explicit answer. During the interview, write only session artifacts and never edit repository files.

## Workflow

1. **Await prerequisites and gather facts.** Complete all pending tasks, file reads, tool calls, and background investigations before thinking about questions and decisions. Gather every discoverable fact from the codebase or tools so no question asks for a fact or relies on a guess.
2. **Compute the round frontier.** Model the problem as a design tree where each decision unlocks dependent decisions. Select every unsettled decision whose prerequisites are already answered as the frontier for this round. Settle who uses it, core actions, inputs, and outputs in initial rounds before asking about storage, architecture, or internals in later rounds, and defer any question that depends on another question open in this round. When an answer adds a new surface such as a UI, API, or package, follow that branch until its user-facing behavior and edge cases are settled.
3. **Author the round artifact.** Write the round to `grilling_round_<N>_<topic>.md` in the session artifact directory using the visual round format below.
4. **Point to the round in chat.** Link the round artifact in chat with a brief, easy-to-scan overview of what this round covers so the user knows what is inside before opening it, ask for replies in normal chat text, and end your turn. Never ask grilling questions through interactive multiple-choice prompt tools, dialogs, or popup widgets.
5. **Iterate until settled, then confirm.** Update the design tree from each reply and repeat steps 1 to 4 until the frontier is empty. Summarize the agreed decisions and wait for explicit user confirmation before implementing.

## Plain language and question rules

- **Ask one decision per question.** Split multi-part choices into separate numbered questions.
- **Explain behavior, not internals.** Write short, simple sentences that describe what changes for the user or system. Replace low-level flags, library APIs, and protocol jargon with plain words.
- **Keep code details out of question text.** Omit file paths, symbol names, and line numbers from the main question unless the decision is about naming or moving that file. Place optional file references on a separate `Code refs:` line at the bottom.
- **Show neutral choices and grounded reasons.** State each option's practical upside and downside without leading wording. Pair every recommendation with why it wins, what cost or risk it adds, and an observed source such as an ADR, repo file, tool check, or user rule. If no repo source backs it, state "General practice (not verified in repo)".

## Round format

````markdown
# Grilling Round <N>: <Topic>

## Context and terms

- **Goal:** <2 to 3 short plain sentences on the problem, what changed since last round, and what this round decides.>
- **Big picture:**

```text
<simple visual arrow flow or diagram showing how the pieces connect, never a prose paragraph>
```

- **Terms used below:**
  - **<term>:** <1-line plain-English definition>

---

### ❓ Q1: <short question title>

<1 to 2 short plain sentences framing the single decision.>

- **Option A: <short option name>**
  - *What happens:* <1 short sentence on user-visible behavior>
  - *Trade-off:* <main upside vs. main downside>
- **Option B: <short option name>**
  - *What happens:* <1 short sentence on user-visible behavior>
  - *Trade-off:* <main upside vs. main downside>

> ➡️ **Recommended:** Option A (reply "yes" to accept)
>
> - **Why:** <key reason and cost/risk, without repeating Option A verbatim>
> - **Based on:** <specific ADR, repo file, tool check, user constraint, or "General practice (not verified in repo)">
> - **Code refs:** <optional file links; omit when not needed>
````
