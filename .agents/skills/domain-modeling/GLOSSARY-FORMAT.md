# Glossary format

Domain vocabulary lives in `GLOSSARY.md` at the repository root. Split into separate glossaries only if a lean glossary genuinely spans two domains a reader should not hold at once.

## Structure

```md
# Glossary

Canonical domain vocabulary for <Project>.

## Language

### <Context Name>

**Order**:
A customer request committing to purchase items.
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request

**Customer**:
A person or organization that places orders.
_Avoid_: Client, buyer, account

## Flagged ambiguities (optional)

- **Order vs. Invoice**: An Order represents customer intent and commitments; an Invoice represents the post-fulfillment accounting demand for payment.
```

## Rules

- **Unique domain concepts only.** Before adding a term, ask whether it is unique to this project's domain or a general programming concept; only the former belongs.
- **Be opinionated.** When multiple words exist for the same concept, pick the best one and list the others under `_Avoid_`.
- **Keep definitions tight.** One or two sentences max. Define what it IS, not what it does.
- **Keep domain terms pure.** Omit code symbols, file paths, magic numbers, and general programming patterns (timeouts, error types, configuration seams, framework conventions).
- **No CI/CD, lint rules, or git tracking concepts.** Verification gates belong in `TESTING.md`. Issue hierarchies belong in `CONTRIBUTING.md`.
- **No architecture duplication.** Omit relationship maps or component topology that duplicate `ARCHITECTURE.md`.
- **Flagged ambiguities are strictly bounded.** Only include `## Flagged ambiguities` when an overloaded or confusable term causes genuine friction during design. Limit each entry to a maximum of two sentences explaining the boundary distinction. Never record implementation details, schema definitions, runtime specs, or ticket histories.

## Repository location

- Domain glossary: `GLOSSARY.md` at the repository root.
- Architectural decisions: `docs/adr/0001-*.md` (indexed in `ARCHITECTURE.md`).
