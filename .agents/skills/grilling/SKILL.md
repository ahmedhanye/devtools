---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Grilling runs at the end. When called alongside other tasks, commands, file reads, tool calls, or background investigations, complete and await all of them first. Begin grilling only after all prerequisite tasks, investigations, and subagents finish.

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

## Execution boundaries

Do not write files to `.scratch/`, mutate codebase files, edit repository documents, or run mutative commands during grilling rounds. Confine all writing during the interview exclusively to session artifacts (`grilling_round_<N>_<topic>.md` and the final summary). Never attempt to implement or stage changes while grilling is in progress. Require explicit user confirmation after the final summary before applying settled agreements.

## Round structure and progression

- **Initial rounds (problem definition)**: Map the problem space, clarify boundaries, and challenge assumptions. Do not propose technical solutions, code architectures, or speculative implementation choices before the problem boundaries are fully settled.
- **Subsequent rounds (solution design)**: Once the problem frontier is agreed upon, evaluate solutions, trade-offs, and implementation strategies.

## Round presentation

Author each interview round into a session artifact (`grilling_round_<N>_<topic>.md`). Keep the chat response to a brief pointer to the session artifact. Ask only for answers to that round.

## Question format

Format each round inside the session artifact like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Word each question so "yes" accepts your recommended answer.

## Frontier progression

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), find it or dispatch a sub-agent to find it, and await its completion before formulating the question. Never ask questions with speculative recommendations while fact-finding or sub-agents are in flight. The _decisions_ are the user's: put each to the user and wait.

The session concludes when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Present a summary of all agreed decisions and wait for user confirmation before implementing.
