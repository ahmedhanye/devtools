---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing .agents/GLOSSARY.md, or recording or editing an ADR.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `.agents/GLOSSARY.md` for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

## File structure

Domain glossary and system architecture decisions live strictly under `.agents/`:

```
.agents/
├── GLOSSARY.md
└── docs/
    └── adr/
        └── 0001-embedded-database-foundation.md
```

Create files lazily: only when you have something to write. If no `.agents/GLOSSARY.md` exists, create one when the first term is resolved. If no `.agents/docs/adr/` exists, create it when the first ADR is needed.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `.agents/GLOSSARY.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

### Update .agents/GLOSSARY.md inline

When a term is resolved, update `.agents/GLOSSARY.md` right there using the format in [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md). Don't batch these up: capture them as they happen.

### Offer ADRs sparingly

Only offer to create an ADR when all criteria in [ADR-FORMAT.md](./ADR-FORMAT.md) are met and explicitly approved by the maintainer. If any criterion is missing, skip the ADR.

