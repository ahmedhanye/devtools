# Research report template

Use this structure when authoring research reports under `.scratch/research/<topic>.md`.

## Structure

```markdown
# Research: <topic title>

- **Date.** YYYY-MM-DD
- **Status.** Completed | In progress
- **Confidence.** High | Medium | Low
- **Scope.** Primary packages, modules, or external libraries investigated.

## Executive summary

Direct answer to the research questions and trade-offs in two to three paragraphs.

## Primary source findings

### <Component or sub-topic 1>

Detailed technical findings for existing behavior, contracts, or data flow:
- Finding statement backed by evidence: `packages/example/src/index.ts#L10-L25`.
- Interaction with adjacent modules or dependencies.

### <Component or sub-topic 2>

Detailed technical findings for the second area.

## Code and spec references

- `packages/core/src/schema.ts#L15-L35`: Primary interface definition.
- `apps/cli/src/commands/build.ts#L45-L60`: Invocation entry point.
- Canonical documentation URL or RFC reference.

## Technical trade-offs

| Option or pattern | Advantages | Disadvantages | Complexity |
| :--- | :--- | :--- | :--- |
| Option A | Concrete benefit | Known limitation | Low / Medium / High |
| Option B | Concrete benefit | Known limitation | Low / Medium / High |

## Open questions and caveats

- Remaining uncertainties or unverified runtime behaviors.
- Potential breaking changes or migration hurdles.
```
