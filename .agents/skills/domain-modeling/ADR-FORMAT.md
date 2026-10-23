# ADR Format

ADRs live in `docs/adr/` and use sequential numbering: `0001-slug.md`, `0002-slug.md`, etc.

Create the `docs/adr/` directory lazily: only when the first ADR is needed.

## Template

```md
# {Short title of the decision}

{1-3 sentences: what's the context, what did we decide, and why.}
```

That's it. An ADR can be a single paragraph. The sequential number belongs exclusively in the filename slug (`docs/adr/0001-slug.md`); do not prefix the markdown H1 title with `{NNNN}:`. The value is in recording *that* a decision was made and *why*, not in filling out sections.

## Optional sections

Only include these when they add genuine value. Most ADRs will not need them:

- **Status** frontmatter (`proposed | accepted | deprecated | superseded by ADR-NNNN`): useful when decisions are revisited.
- **Considered options**: only when the rejected alternatives are non-obvious and worth remembering.
- **Consequences**: only when non-obvious downstream effects or liabilities need to be called out.

## Numbering

Scan `docs/adr/` for the highest existing number and increment by one.

## When to offer an ADR

All of the following criteria must be satisfied:

1. **Hard to reverse (One-Way Door)**: The cost of changing your mind later is meaningful (e.g. database engine, persistence model, communication protocols).
2. **Surprising without context**: A future reader will look at the code and wonder "why on earth did they do it this way?"
3. **The result of a real trade-off**: There were genuine competing technical alternatives and you picked one for deliberate reasons.
4. **Explicit maintainer confirmation**: Agents must never author or commit an ADR autonomously. Only draft an ADR when explicitly approved by the maintainer during a design session.

If any criterion is missing, skip the ADR.

### What qualifies

- **Persistence architecture**: Database engine, storage pragmas, connection boundaries, migration lifecycle (`0001-embedded-database-foundation.md`).
- **Runtime execution and network boundaries**: Cross-process contracts, service communication protocols, in-process routing vs background daemons.
- **Technology choices that carry lock-in**: Foundational runtime engines, database drivers, auth boundaries. Not routine libraries: only choices that would require substantial rewrites or data migrations to swap out.
- **Boundary and scope decisions**: Package ownership and encapsulation boundaries where reasonable people would assume the opposite.
- **Load-bearing rejected architectural alternatives**: Architectural options (such as cross-package boundaries, persistence models, or runtime lifecycle/process boundaries) that were investigated and deliberately rejected with non-obvious reasoning. Recording these prevents future AI sessions and developers from repeatedly re-proposing the same rejected design. Requires explicit maintainer confirmation.

### What does NOT qualify

- **CI/CD workflows and pipeline scripts**: Path filtering, status check naming, job dependencies, and skip gates.
- **Developer tooling and formatting**: Linters, formatters, compiler options, and test runner configurations.
- **Git workflows and tracking procedures**: Branching models, ticket hierarchies, commit message rules, and PR checklists.
- **Local code refactoring and module depth**: Function extractions, internal class design, and localized seams.
- **Routine code cleanups and localized refactorings**: Declining a localized function extraction, rename, internal module seam, or style suggestion is an ordinary review event, not an architectural decision. Never create an ADR for routine review disagreements.
