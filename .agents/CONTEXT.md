# DevTools

Developer tooling monorepo providing development utilities and workflows across CLI, daemon, API, and frontend interfaces.

## Language

**Daemon**:
The single production Bun process that serves compiled frontend static assets and routes API requests in-process on a single port.

**Runtime Stack**:
The interconnected pipeline linking CLI commands, local daemon, Hono API routes, and Next.js static frontend.

**Slice Boundary**:
The explicit encapsulation boundary (`index.ts`) of an architectural slice, exposing only its root entry point.

**Spec**:
A high-level capability specification tracking a milestone or major feature. Contains child tickets and holds the release milestone.

**Ticket**:
An atomic vertical slice delivering end-to-end functionality across schema, logic, UI, and tests for a parent Spec. Does not hold a milestone.

**Frontier**:
The set of open tickets whose blocking dependencies are resolved and are ready for immediate pickup.

**Directly Responsible Individual (DRI)**:
The single human or agent holding atomic execution responsibility for an issue.

**One-Way Door**:
An architectural decision or change that has high reversal cost.

**Two-Way Door**:
A reversible change that can be walked back with minimal cost or risk.

**Artifact**:
A working document, report, or visual preview generated during execution and stored in `.scratch/`.

**Scratch File**:
An ephemeral working file (debug script, raw spike, diff) living strictly in the gitignored `.scratch/` directory.

**Handoff**:
A structured transition document recording settled decisions, active blockers, and the next frontier in `.scratch/handoffs/`.

**Research Spike**:
A time-boxed investigation of primary sources in `.scratch/research/` that terminates by recording a decision in an ADR.

**Workspace Root**:
The top-level project container holding repository-wide developer tooling, formatting, and the shared TypeScript compiler.

**Leaf Workspace**:
An isolated application (`apps/*`) or shared library package (`packages/*`) with its own package manifest and boundary.

**Direct Dependency**:
A package declared explicitly in a workspace's own `package.json`.

**Phantom Dependency**:
An undeclared package imported inside a workspace that resolves only through parent or sibling hoisting.

**Shared Core**:
The `@devtools/core` package providing domain schemas, types, and error definitions used across multiple packages.
