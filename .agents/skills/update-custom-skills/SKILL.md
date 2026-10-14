---
name: update-custom-skills
description: Reconcile upstream vendor skill updates with local customizations for all skills in .agents/skills-override.json. Use when checking or updating custom skills, or when prompted by /update-custom-skills.
---

# Update custom skills

Reconcile upstream prompt improvements with local customizations for all skills registered in `.agents/skills-override.json`.

## Workflow

### 1. Read custom skill overrides

1. Read `.agents/skills-override.json`.
2. Extract all registered skill entries containing `source`, `path`, and `commit`.
3. If no skills are registered, report that the manifest is empty and stop.
4. Completion criterion: All registered custom skill entries are loaded for inspection.

### 2. Check upstream commit status

For each skill entry in `.agents/skills-override.json`:
1. Query GitHub for the latest commit SHA affecting `<path>`:
   ```bash
   gh api repos/<source>/commits?path=<path> -q '.[0].sha'
   ```
2. Compare the upstream commit SHA with `commit` in `.agents/skills-override.json`.
3. If the remote commit SHA matches `commit`:
   - Report that `<skill>` is already up to date.
4. If the remote commit SHA differs from `commit`:
   - Queue `<skill>` for reconciliation with `<latestCommit>`.
5. Completion criterion: Upstream commit status is verified for every registered skill.

### 3. Retrieve upstream diffs

For each skill queued for reconciliation:
1. Fetch the commit comparison or raw upstream content:
   ```bash
   gh api repos/<source>/compare/<commit>...<latestCommit>
   ```
   Or retrieve the latest raw file content:
   ```bash
   gh api repos/<source>/contents/<path>?ref=<latestCommit> -q '.content' | base64 -d
   ```
2. Compare upstream changes against local `.agents/skills/<skill>/SKILL.md`.
3. Completion criterion: Upstream prompt additions and conflicts are identified for every queued skill.

### 4. Reconcile differences with grilling

For each queued skill:
1. If upstream introduced new prompt techniques, sections, or phrasing to evaluate, invoke the `grilling` skill to resolve trade-offs.
2. Wait for user input to settle decisions.
3. Completion criterion: All frontier questions are resolved and the user explicitly confirms the reconciled skill text for every updated skill.

### 5. Apply reconciled skills and update manifest

For each reconciled skill:
1. Write the confirmed reconciled text to `.agents/skills/<skill>/SKILL.md`.
2. Update the `commit` field for `<skill>` in `.agents/skills-override.json` to `<latestCommit>`.
3. Completion criterion: Every reconciled `.agents/skills/<skill>/SKILL.md` is saved and `.agents/skills-override.json` records the new commit hashes.
