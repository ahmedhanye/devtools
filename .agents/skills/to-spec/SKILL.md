---
name: to-spec
description: Synthesize the current conversation and codebase context into a specification and publish it to GitHub.
disable-model-invocation: true
---

# To spec

Synthesize decisions already made in the conversation and the current codebase into a spec rather than running a fresh requirements interview; write the proposal to a session Markdown artifact for confirmation before publishing to GitHub.

## Process

1. **Load repository docs, metadata, and code.** Read `CONTRIBUTING.md` (and its linked issue guide), `.github/ISSUE_TEMPLATE/`, `ARCHITECTURE.md` (including its ADR index), `CODING_STANDARDS.md`, `TESTING.md`, and `GLOSSARY.md`. Load only the linked context glossaries and ADRs relevant to the feature. Check live GitHub labels and milestones when applicable, and explore affected code so the spec uses canonical domain terms and respects existing decisions.

   Completion criterion: `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/`, `ARCHITECTURE.md`, `CODING_STANDARDS.md`, `TESTING.md`, `GLOSSARY.md`, and affected linked context glossaries and ADRs read, live GitHub metadata checked, and affected areas explored.

2. **Sketch testing seams.** Propose the testing seams for the feature. Favor existing seams over new ones, pick the highest public boundary possible, and minimize the seam count (ideally one). When more than one seam is needed, note why a single higher seam is insufficient.

   Completion criterion: Testing seams selected and justified for the spec proposal.

3. **Propose via artifact, confirm, and publish to GitHub.** Draft the spec following `CONTRIBUTING.md` (and its linked issue guide), `.github/ISSUE_TEMPLATE/`, and the optional sections below. Write the full proposal to a Markdown artifact in the session artifact directory (such as `spec_proposal_<slug>.md`) instead of pasting it in chat, including planned GitHub metadata (title, labels, and milestone), proposed testing seams, any unconfirmed assumptions from a cold start, and a diagram or table when it clarifies architecture. Link the artifact in chat, highlight only open questions or assumptions needing input, and wait for user confirmation before publishing. Once confirmed, create the GitHub issue and return its URL.

   Completion criterion: Proposal artifact linked in chat, confirmed by the user, published to GitHub following repository conventions, and issue URL returned.

## Spec template

Include only sections that add concrete value for the feature. Treat `User stories`, `In and out of scope`, `Architecture and design decisions`, and `Testing decisions` (along with any optional repository template fields) as optional, omitting any unnecessary section completely instead of writing boilerplate or "N/A".

```markdown
### Overview and problem statement

What capability this introduces and what concrete problem or user need it solves.

### User stories

Numbered list covering personas, core paths, edge cases, and failure modes:

1. As an <actor>, I want <capability>, so that <benefit>.

### In and out of scope

- **In scope.** Concrete boundaries delivered under this spec.
- **Out of scope.** Deferred work, non-goals, and excluded integrations.

### Architecture and design decisions

Module boundaries, schemas, and public contracts. Describe interfaces rather than internal file paths or implementation code, which go stale. Inline a short snippet only when a prototype produced a decision-rich shape such as a state machine, reducer, schema, or type.

### Testing decisions

- Agreed seams, modules tested, and external behaviors verified.
- Prior art or existing fixtures reused.

### Acceptance criteria

- [ ] Verification suite passes
- [ ] All child work items delivered and verified
```
