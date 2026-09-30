# Paths and storage

Guidelines for artifact storage and domain documentation paths in this repository.

## Working artifacts and storage locations

- Keep all temporary working files, research spikes, handoffs, and preview artifacts in `.scratch/`:
  - Session handoffs: `.scratch/handoffs/<topic>-handoff.md`
  - Research spikes: `.scratch/research/<topic>.md`
  - Ephemeral artifacts and scripts: `.scratch/`
- Keep durable architectural decisions in `.agents/adr/`.

## File paths for .agents

Skills and automated tools must look in `.agents/` for domain and governance documents:

- Domain glossary: `.agents/CONTEXT.md` (overrides root `CONTEXT.md`)
- Architectural decisions: `.agents/adr/` (overrides `docs/adr/`)
- Issue tracker guide: `.agents/docs/issue-tracker.md` (overrides `docs/agents/issue-tracker.md`)
