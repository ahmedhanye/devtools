# Context Glossary Format

Domain glossaries live under `docs/glossary/` and are mapped from `GLOSSARY-MAP.md` at the repository root.

## Structure

```md
# {Context Name}

{One or two sentence description of what this context is and why it exists.}

## Language

**Order**:
{A one or two sentence description of the term}
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

- **Be opinionated.** When multiple words exist for the same concept, pick the best one and list the others under `_Avoid_`.
- **Keep definitions tight.** One or two sentences max. Define what it IS, not what it does.
- **Only include terms specific to this project's context.** General programming concepts (timeouts, error types, utility patterns) don't belong even if the project uses them extensively.
- **No CI/CD, lint rules, or git tracking concepts.** Verification gates belong in `.agents/rules/verification.md`. Issue hierarchies belong in `CONTRIBUTING.md`.
- **Flagged ambiguities are strictly bounded.** Only include `## Flagged ambiguities` when an overloaded or confusable term caused genuine friction during design. Limit each entry to a maximum of two sentences explaining the boundary distinction. Never record implementation details, schema definitions, runtime specs, or ticket histories.

## Repository Location & Mapping

- Root map: `GLOSSARY-MAP.md` at the repository root.
- Context glossaries: `docs/glossary/<context>.md`.
- Architectural decisions: `docs/adr/0001-*.md`.
