---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing GLOSSARY.md, or recording or editing an ADR.
---

# Domain modeling

Actively build and sharpen the project's domain model as you design. Challenge vague terms, test boundaries with concrete scenarios, and record vocabulary and decisions the moment they crystallize.

(Merely reading `GLOSSARY.md` or ADRs for vocabulary is not this skill. Use this skill only when changing the domain model, not when consuming it.)

Domain vocabulary lives in `GLOSSARY.md` at the repository root. System-wide architectural decisions live under `docs/adr/` indexed in `ARCHITECTURE.md`. Create `GLOSSARY.md` or ADR files only when you have concrete entries to write.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `GLOSSARY.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is it?"

### Update the glossary inline

When a term is resolved, update `GLOSSARY.md` right there using [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md), placing it under the matching section heading. Capture resolved terms as they happen rather than batching them.

Keep the glossary free of implementation details, code paths, magic numbers, and CI or git workflow rules. Mechanics belong in `docs/architecture/`, verification gates belong in `TESTING.md`, and issue tracking belongs in `CONTRIBUTING.md`.

### Offer ADRs sparingly

Only offer to create an ADR when all criteria in [ADR-FORMAT.md](./ADR-FORMAT.md) are met and explicitly approved by the maintainer. If any criterion is missing, skip the ADR. When an ADR is added or updated, update the ADR index table in `ARCHITECTURE.md`.
