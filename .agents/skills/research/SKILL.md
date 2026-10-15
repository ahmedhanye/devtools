---
name: research
description: Research technical questions against primary sources, codebase facts, and documentation. Use when investigating architecture, API contracts, library options, or delegating technical exploration.
---

# Research

Investigate technical questions against primary sources, verify facts across code and documentation, and capture findings in a persistent markdown report.

## Core rules

1. **Primary sources over hearsay.** Treat compilers, tests, runtime outputs, and source code as ground truth. Consult official specifications, RFCs, and first-party documentation before secondary articles. Discard or quarantine third-party blog posts and unverified summaries.
2. **Document reality first.** Record how the system currently works before proposing architectural changes.
3. **Search for counter-evidence.** For every technical assumption or hypothesis, search for contrary facts, deprecation notices, version mismatches, and edge-case limitations.

## Workflow

### 1. Scope and decompose

1. Read all user-referenced files, tickets, or schemas completely before starting research.
2. Formulate 2 to 4 concrete, falsifiable research questions.
3. Identify relevant packages, configuration files, and official documentation portals.

Completion criterion: 2 to 4 specific questions and identified source boundaries.

### 2. Gather primary evidence

Collect primary evidence directly, or dispatch a background research subagent when coordinating foreground work to keep interactions responsive.

1. **Codebase evidence.** Locate relevant symbols, types, tests, and configuration files. Capture exact repository-relative paths and line numbers.
2. **External evidence.** Fetch first-party documentation, specifications, or library source code. Note version numbers and release dates.
3. **Empirical evidence.** When static documentation is ambiguous, verify behavior with quick CLI checks, such as `--help` or type checks, or existing test fixtures.

Completion criterion: Verifiable code references or documentation links for every question.

### 3. Falsify and cross-examine

1. Check for version drift. Verify that external documentation matches the exact package version declared in `package.json` or lockfiles.
2. Search for breaking changes, caveats, open GitHub issues, and known edge cases.
3. If two sources disagree, prioritize executable code and tests over written documentation, and prioritize official docs over community discussions.

Completion criterion: Conflicting claims resolved or explicitly documented with confidence ratings.

### 4. Synthesize and persist

Write the research document to `.scratch/research/<topic>.md` using the template below.

<research-template>

# Research: <topic title>

**Date**: YYYY-MM-DD  
**Status**: Completed | In progress  
**Confidence**: High | Medium | Low  
**Scope**: Primary packages, modules, or external libraries investigated  

## Executive summary

Direct answer to the research questions and trade-offs in 2 to 3 paragraphs.

## Primary source findings

### <Sub-topic or component 1>

Detailed technical findings for existing behavior, contracts, or data flow:
- Finding statement backed by evidence ([file.ts#L10-L25](file.ts#L10-L25)).
- Interaction with adjacent modules or dependencies.

### <Sub-topic or component 2>

Detailed technical findings for the second area.

## Code and spec references

- `packages/core/src/schema.ts#L15-L35`: Primary interface definition.
- `apps/cli/src/commands/build.ts#L45-L60`: Invocation entry point.
- Canonical documentation URL or RFC reference.

## Technical trade-offs

| Option or pattern | Advantages | Disadvantages | Complexity |
| :--- | :--- | :--- | :--- |
| **Option A** | Concrete benefit | Known limitation | Low / Medium / High |
| **Option B** | Concrete benefit | Known limitation | Low / Medium / High |

## Open questions and caveats

- Remaining uncertainties or unverified runtime behaviors.
- Potential breaking changes or migration hurdles.

## Recommended next steps

Concrete, prioritized recommendations:
1. First recommended action.
2. Follow-up skill recommendation:
   - Run `/to-spec` if findings warrant a capability specification.
   - Run `/to-tickets` if the path forward is clear and needs vertical tracer-bullet slicing.
   - Run `/prototype` if an empirical prototype is needed to settle remaining unknowns.
   - Run `/grilling` to stress-test architectural decisions with the user.

</research-template>

Completion criterion: The file exists at `.scratch/research/<topic>.md` with all template sections completed and no placeholders remaining.

### 5. Present summary

Deliver a response that:
1. Answers the user question directly in under 300 words.
2. Links to the report at `.scratch/research/<topic>.md`.
3. Highlights key trade-offs and confidence levels.
4. Suggests follow-up skills (`to-spec`, `to-tickets`, `prototype`, `grilling`) if needed.

Completion criterion: Response sent to user with under 300 words, repository-relative link to `.scratch/research/<topic>.md`, trade-offs, and applicable follow-up skills.
