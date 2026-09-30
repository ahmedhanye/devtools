# DevTools

Developer tooling monorepo providing development utilities and workflows.

## Language

**Spec**:
A high-level capability specification tracking a milestone or major feature. Contains child tickets and holds the release milestone.
_Avoid_: Epic, story, parent ticket, feature request

**Ticket**:
An atomic vertical slice delivering end-to-end functionality across schema, logic, UI, and tests for a parent Spec. Does not hold a milestone.
_Avoid_: Sub-task, issue, task, story

**Frontier**:
The set of open tickets whose blocking dependencies are resolved and are ready for immediate pickup.
_Avoid_: Backlog, queue, next items

**Directly Responsible Individual (DRI)**:
The single human or agent holding atomic execution responsibility for an issue.
_Avoid_: Owner, assignee, lead

**One-Way Door**:
An architectural decision or change that is difficult or destructive to reverse.
_Avoid_: Permanent change, breaking change

**Two-Way Door**:
A reversible change that can be walked back with minimal cost or risk.
_Avoid_: Safe change, minor edit

**Artifact**:
A working document, report, or visual preview generated during execution and stored in `.scratch/`.
_Avoid_: Document, output, temp file

**Scratch File**:
An ephemeral working file (debug script, raw spike, diff) living strictly in the gitignored `.scratch/` directory.
_Avoid_: Temp file, /tmp file

**Handoff**:
A structured transition document recording settled decisions, active blockers, and the next frontier in `.scratch/handoffs/`.
_Avoid_: Session notes, handover, status report

**Research Spike**:
A time-boxed investigation of primary sources in `.scratch/research/` that terminates by recording a decision in an ADR.
_Avoid_: Whitepaper, study, agent research doc
