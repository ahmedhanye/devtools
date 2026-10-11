# DevTools

Developer tooling monorepo providing development utilities and workflows across CLI, daemon, API, and frontend interfaces.

## Language

### System and runtime architecture

**Daemon**:
The single production Bun process that serves compiled frontend static assets and routes API requests in-process on a single port.
_Avoid_: Background server, host process, runner daemon

**Runtime Stack**:
The interconnected pipeline linking CLI commands, local daemon, Hono API routes, and Next.js static frontend.
_Avoid_: Application stack, architecture stack, platform

**Slice Boundary**:
The explicit encapsulation boundary (`index.ts`) of an architectural slice, exposing only its public interface.
_Avoid_: Module export, public surface, layer gate

**Shared Core**:
The `@devtools/core` package providing domain schemas, types, and error definitions used across multiple packages.
_Avoid_: Common library, shared utils, base package

**Standalone Executable**:
A self-contained single-file binary produced by `bun build --compile` embedding the Bun engine, entrypoint bytecode, and dependencies.
_Avoid_: Native binary, compiled bundle, distribution build

**Checksum Manifest**:
The cryptographic verification file (`SHA256SUMS.txt`) documenting SHA256 hashes of compiled standalone executables attached to a GitHub release.
_Avoid_: Hash list, verification file, signature manifest

### Issue and project management

**Spec**:
A high-level capability specification tracking a milestone or major feature. Contains child tickets and holds the release milestone.
_Avoid_: Epic, parent issue, milestone epic

**Ticket**:
An atomic vertical slice delivering end-to-end functionality across schema, logic, UI, and tests for a parent Spec. Does not hold a milestone.
_Avoid_: Sub-issue, task, child issue

**Frontier**:
The set of open tickets whose blocking dependencies are resolved and are ready for immediate pickup.
_Avoid_: Backlog, ready queue, actionable tasks

**Directly Responsible Individual (DRI)**:
The single human or agent holding atomic execution responsibility for an issue.
_Avoid_: Assignee, issue owner, lead

### Workspace and dependency architecture

**Workspace Root**:
The top-level project container holding repository-wide developer tooling, formatting, and the shared TypeScript compiler.
_Avoid_: Monorepo root, top-level directory, base repo

**Leaf Workspace**:
An isolated application (`apps/*`) or shared library package (`packages/*`) with its own package manifest and boundary.
_Avoid_: Subpackage, child module, nested package

**Direct Dependency**:
A package declared explicitly in a workspace's own `package.json`.
_Avoid_: Local dependency, declared package

**Phantom Dependency**:
An undeclared package imported inside a workspace that resolves only through parent or sibling hoisting.
_Avoid_: Hoisted dependency, transitive import, undeclared package

### Temporary artifacts and execution

**Artifact**:
A working document, report, or visual preview generated during execution and stored in workspace `tmp/`.
_Avoid_: Build binary, output file, generated asset

**Ephemeral File**:
A temporary working file (debug script, raw spike, diff) living strictly in the gitignored workspace `tmp/` directory, partitioned by purpose under `tmp/scripts/`, `tmp/research/`, `tmp/handoff/`, `tmp/issues/`, or `tmp/qa/`.
_Avoid_: Scratch file, temp file, scratchpad

**Handoff**:
A structured transition document recording settled decisions, active blockers, and the next frontier in `tmp/handoff/`.
_Avoid_: Session dump, state summary, context log

**Research Spike**:
A time-boxed investigation of primary sources in `tmp/research/` that terminates by recording a decision in an ADR.
_Avoid_: Exploratory spike, research spike branch, scratch investigation

### Governance, pull requests, and security

**Release PR**:
The automated candidate pull request maintained on `main` by Release Please that aggregates Conventional Commits into changelog and version updates until merged by a maintainer.
_Avoid_: Version bump PR, changelog PR

**One-Way Door**:
An architectural decision or change that has high reversal cost.
_Avoid_: Permanent change, irreversible choice

**Two-Way Door**:
A reversible change that can be walked back with minimal cost or risk.
_Avoid_: Low-risk change, reversible choice

**Code Owner**:
The designated maintainer account (`@AhmedHanye`) holding mandatory review responsibility across the repository, declared via `.github/CODEOWNERS` and enforced via repository rulesets.
_Avoid_: Repository reviewer, project owner

**Private Vulnerability Reporting (PVR)**:
The confidential disclosure channel within GitHub Security Advisories enabling researchers to submit vulnerability reports under a 48-hour triage SLA without public disclosure.
_Avoid_: Security inbox, private advisory, vulnerability report

**Fork Security Boundary**:
The repository perimeter protection enforced via GitHub Branch Rulesets and mandatory Code Owner review (`@AhmedHanye`) ensuring external fork pull requests cannot modify protected workflows, toolchain manifests, or agent instruction files without explicit maintainer approval.
_Avoid_: Fork sandbox, external PR guard

**Branch Ruleset**:
The repository policy configuration on `main` enforcing required CI status checks, linear squash merges, and Code Owner review gates with maintainer bypass authorization.
_Avoid_: Branch protection rule, branch guard

**Vendor Skill**:
An external capability package declared in `skills-lock.json` whose upstream instructions may be superseded by repository-specific execution boundaries.
_Avoid_: Locked skill, third-party skill, external skill

**Review Thread Resolution**:
The pull request state invariant enforced by repository rulesets requiring all reviewer and bot comment conversations to be explicitly marked resolved before merge eligibility.
_Avoid_: Comment signoff, thread closing

**Quality Assurance (QA)**:
The end-to-end verification discipline synthesizing automated code-review findings with human-in-the-loop manual verification beyond CI capabilities.
_Avoid_: Manual testing, PR gatekeeping, ad-hoc verification

### Documentation and developer guides

**Documentation Platform**:
The Fumadocs documentation application workspace (`site/`, `@devtools/site`) providing guides, Diátaxis documentation, and public interface references for DevTools.
_Avoid_: Docs site, static docs, manual

**Diátaxis Quadrant**:
One of the four systematic documentation classifications (`Tutorials`, `How-to Guides`, `Reference`, `Explanation`) structuring developer content based on reader intent and pedagogical orientation.
_Avoid_: Documentation category, doc type, topic section, page group

**Topic Group**:
An intermediate organizational grouping or separator in the navigation hierarchy (such as `---Daemon & Database---` or a folder group) clustering related documentation pages within a quadrant.
_Avoid_: Section group, page category, folder group, category, section

**Documentation Page**:
An individual documentation document inside a quadrant (specialized by role: Tutorial, How-To Guide, Reference Specification, or Explanation Article).
_Avoid_: Doc file, guide page, article, page item

**Page Section**:
A headed section within an individual documentation page (defined by Markdown `#`, `##`, `###` headings and reflected in the table of contents).
_Avoid_: Document section, page header, document part, sub-section
