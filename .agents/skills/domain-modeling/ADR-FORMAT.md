# ADR format

ADRs live in `docs/adr/` using sequential numbering (`0001-slug.md`, `0002-slug.md`, etc.) and are indexed in `ARCHITECTURE.md`.

The ADR owns *what* and *why*; the code and `docs/architecture/` own *how*. Focus on why the decision was made and what alternatives were rejected rather than duplicating schemas, tables, file layouts, symbol inventories, or timeouts from `docs/architecture/`. Record **one decision per ADR** so future reversals supersede cleanly without partial edits.

## Template

```md
---
status: proposed
date: YYYY-MM-DD
---

# {Short title of the decision}

{1-3 sentences: what is the context, what did we decide, and why.}
```

An ADR can be a single paragraph. Most ADRs do not need optional sections.

The sequential number belongs exclusively in the filename slug (`docs/adr/0001-slug.md`); never prefix the markdown H1 title with `{NNNN}:`. Valid `status` values are `proposed`, `accepted`, `deprecated`, `superseded by ADR-NNNN`, or `partially superseded by ADR-NNNN`. Treat accepted ADRs as immutable: when an accepted decision reverses, add a new ADR with `supersedes: ADR-NNNN` and update the old ADR's `status` rather than rewriting its original decision text or appending post-hoc specs from later ADRs.

## Optional sections

Only include these when they add genuine value:

- **Considered options:** Only when rejected alternatives are non-obvious and worth remembering so future contributors do not re-propose them.
- **Consequences:** Only when non-obvious downstream effects or liabilities need calling out, linking to `docs/architecture/` for mechanics.

## Numbering

Scan `docs/adr/` for the highest existing number and increment by one. When creating or superseding an ADR, add or update its row in `ARCHITECTURE.md`.

## When to offer an ADR

All of the following criteria must be satisfied:

1. **Hard to reverse (One-Way Door):** The cost of changing your mind later is meaningful (such as database engine, persistence model, or communication protocols).
2. **Surprising without context:** A future reader will inspect the code and wonder why it was built this way.
3. **The result of a real trade-off:** Genuine competing technical alternatives existed and one was chosen for deliberate reasons.
4. **Explicit maintainer confirmation:** Agents must never author or commit an ADR autonomously. Draft an ADR only when explicitly approved by the maintainer during a design session.

If any criterion is missing, skip the ADR.

### What qualifies

- **Persistence architecture:** Database engine, storage pragmas, connection boundaries, migration lifecycle.
- **Runtime execution and network boundaries:** Cross-process contracts, service communication protocols, in-process execution vs background workers.
- **Technology choices that carry lock-in:** Foundational runtime engines, database drivers, or auth boundaries requiring substantial rewrites or data migrations to swap out.
- **Boundary and scope decisions:** Package ownership and encapsulation boundaries where reasonable readers would assume the opposite.
- **Deliberate deviations from the obvious path:** Choosing an unexpected design for concrete constraints rather than the idiomatic default.
- **Constraints not visible in the code:** External runtime limits, platform quirks, or operational invariants that explain why simpler code does not work.
- **Load-bearing rejected architectural alternatives:** Cross-package boundaries, persistence models, or runtime process models investigated and rejected for non-obvious reasons.

### What does NOT qualify

Skip an ADR whenever any of the four admission criteria fails. Linter-enforced coding rules belong in `CODING_STANDARDS.md`, verification gates belong in `TESTING.md`, CI and git workflows belong in `CONTRIBUTING.md`, and local refactorings belong in code review.
