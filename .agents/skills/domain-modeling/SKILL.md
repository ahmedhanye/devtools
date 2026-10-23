---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing GLOSSARY-MAP.md or docs/glossary/*.md, or recording or editing an ADR.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* the glossary for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

## File structure

DevTools organizes domain vocabulary across bounded contexts indexed by a root map:

```
/
├── GLOSSARY-MAP.md
├── docs/
│   ├── glossary/
│   │   ├── runtime.md       ← daemon, CLI, runtime stack, standalone binary
│   │   ├── browser.md       ← resolution waterfall, managed cache, CfT
│   │   └── persistence.md   ← database foundation, connection, seams
│   └── adr/
│       ├── 0001-embedded-database-foundation.md
│       └── 0002-package-configuration-and-environment-seams.md
```

Create files lazily: only when you have something to write.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in the relevant context glossary under `docs/glossary/`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

### Update glossaries inline

When a term is resolved, infer which context it belongs to (or ask) and update that context file in `docs/glossary/` right there using the format in [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md). If a new context is introduced, add it to `GLOSSARY-MAP.md`. Don't batch these up: capture them as they happen.

Domain glossaries should be totally devoid of implementation details and CI/CD/workflow rules. Verification gates belong in `.agents/rules/verification.md`; issue tracking belongs in `CONTRIBUTING.md`.

### Offer ADRs sparingly

Only offer to create an ADR when all criteria in [ADR-FORMAT.md](./ADR-FORMAT.md) are met and explicitly approved by the maintainer. If any criterion is missing, skip the ADR.

## Consumer habits

When consuming domain models in engineering workflows:

- **Vocabulary enforcement**: Use canonical terms from `GLOSSARY-MAP.md` and context glossaries in code symbols, PR and issue titles, tests, and documentation. Never use synonyms listed under `_Avoid_`.
- **Silent absence**: Proceed silently when a glossary or `docs/adr/` does not exist. Do not scaffold empty placeholders.
- **Domain gap signaling**: Treat missing domain concepts as unvetted jargon or model gaps requiring `/domain-modeling`. Do not invent ad-hoc terms.
- **ADR conflict surfacing**: Surface contradictions explicitly when an exploration or refactor conflicts with an ADR: `Contradicts ADR-NNNN, but worth reopening because...`.
