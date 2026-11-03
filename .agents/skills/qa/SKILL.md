---
name: qa
description: Three-axis quality assurance and test verification across black-box, gray-box, and white-box domains.
disable-model-invocation: true
---

# Quality assurance

Run a three-axis quality assurance review across any repository. The coordinator captures baseline metadata, partitions changed source and test files across three non-overlapping testing axes, dispatches three parallel subagents, and presents a deduplicated summary in chat. Keep tracked repository files untouched throughout the review.

## Coordinator workflow

### 1. Capture baseline metadata and discover standards in one batch

- **Diff-scoped mode.** Run one batched non-interactive command (up to 10 seconds before backgrounding) creating `.scratch/qa/<timestamp>-<slug>/` (UTC `date -u +%Y-%m-%dT%H-%M-%SZ` and a kebab-case slug) and `.scratch/qa/<timestamp>-<slug>/context.md` with `git status -s`, `git log <base>..HEAD --oneline`, `git diff <base> --name-status --diff-filter=d`, and issue or PR metadata (`gh issue view <id> --json title,body` or `gh pr view --json number,title,body`). Stop if the ref is invalid or diff is empty.
- **Full-repo baseline mode.** Create `.scratch/qa/<timestamp>-<slug>/` and write the active source and test file inventory into `.scratch/qa/<timestamp>-<slug>/context.md`.

In the same turn, read repository testing standards (`TESTING.md`, `CONTRIBUTING.md`, or `AGENTS.md`, if present) and build manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, or `Makefile`) in parallel to identify test conventions, runner scripts, static analyzers, architecture linters, and coverage gates without reading the subagent playbooks.

### 2. Partition files and commands by paired test level and inspection lens

Assign every active test file, verification command, and modified source file to its matching axis (whether the repository separates test levels by filename suffix, directory layout, or test content) so subagents run with zero duplicate suite executions or overlapping code audits:

| Axis          | Assigned test suites                                                                                                                     | Assigned static and coverage checks                                                                     | Source files and inspection lens                                                                                                                                                                                                    |
| :------------ | :--------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Black-box** | End-to-end (`*.e2e.*`, `e2e/`), CLI subprocess, browser, smoke, and interactive UI story (`*.stories.*`, where applicable) suites        | Build smoke checks                                                                                      | CLI binaries, command flag parsers, public UI components, and end-to-end user workflows (audited for external observable behavior, exit codes, stream routing, and interactive accessibility)                                       |
| **Gray-box**  | Integration suites (`*.integration.*`, `integration/` covering HTTP routes, middleware, daemons, databases, adapters, and loaders)       | Architectural boundary linters, layer linters, and static security scanners                             | API servers, route handlers, middleware, static-asset handlers, database clients and migrations, and cross-package adapters (audited through module seams, HTTP/wire requests, and persistence lifecycles)                          |
| **White-box** | Unit suites (`*.unit.*`, `unit/`, or co-located unit tests covering pure functions, schemas, domain errors, hooks, and build/repo tools) | Typecheckers, linters, dead-code, duplication, complexity analyzers, and coverage + diff-coverage gates | All modified executable source files paired with unit suites (audited for internal control-flow branches, default seam-pair parameters, algebraic properties, and surviving mutants; exclude markdown prose from mutation analysis) |

Partitioning rules:

1. **Deduplicate umbrella scripts.** Assign the single command that executes each suite once. Assign shared coverage collection exclusively to the White-box subagent, and omit a separate unit test run when the coverage script already runs the unit suites.
2. **Pair source files with their unit and integration tests.** When a modified source module has both a unit suite and an integration or E2E suite, list the file for White-box branch/mutation auditing against its unit suite and for Gray-box or Black-box contract auditing against its integration or E2E suite.

### 3. Spawn three parallel subagents to execute and write the reports

Spawn three subagents in parallel in a single turn (or execute sequentially if the runtime does not support subagents):

- **Black-box subagent.** Playbook: [`black-box-testing.md`](black-box-testing.md). Target report: `.scratch/qa/<timestamp>-<slug>/black-box-testing.md`.
- **Gray-box subagent.** Playbook: [`gray-box-testing.md`](gray-box-testing.md). Target report: `.scratch/qa/<timestamp>-<slug>/gray-box-testing.md`.
- **White-box subagent.** Playbook: [`white-box-testing.md`](white-box-testing.md). Target report: `.scratch/qa/<timestamp>-<slug>/white-box-testing.md`.

Keep each dispatch prompt under 200 words: pass this skill path (`.agents/skills/qa/SKILL.md`), the subagent's axis playbook path, `.scratch/qa/<timestamp>-<slug>/context.md`, any axis-specific testing guide paths discovered in step 1, assigned source files, test files, batched shell commands, and target report path. Await all three subagents (ending your turn immediately if your runtime dispatches subagents asynchronously) without polling subagent status.

### 4. Read subagent reports and present deduplicated summary

Read `.scratch/qa/<timestamp>-<slug>/{black,gray,white}-box-testing.md` in parallel to verify axis alignment and deduplicate findings across reports. Reply in chat with a summary of **at most 15 lines** covering:

- Verification coverage and test pass/fail totals across the Black-box, Gray-box, and White-box passes.
- Deduplicated core defects, missing tests, and standards violations discovered across the three axes.
- Estimated developer effort for fixes.
- Links to `.scratch/qa/<timestamp>-<slug>/{black,gray,white}-box-testing.md`.
- Any `Human verification required` checks from the reports (omit this bullet completely when all checks were verified by machine).

---

## Shared subagent protocol

Every QA subagent follows these four shared steps alongside its axis playbook:

### 1. First-turn parallel batching and file loading

1. In your first turn, read `.agents/skills/qa/SKILL.md`, your assigned axis playbook, `.scratch/qa/<timestamp>-<slug>/context.md`, and prompt testing guides in a single parallel batch while launching assigned shell commands in one or two non-interactive invocations (up to 10 seconds before backgrounding). Rely on `context.md` for git history, issue descriptions, and diff summaries rather than re-running git commands.
2. While backgrounded commands run, read assigned source and test files in whole-file parallel batches (10 to 15 files per turn) without polling task status; end your turn only when all file reads are complete.

### 2. Probe hygiene and isolation

Run delta probes in one concise inline command (under 40 lines) with per-probe timeouts (`AbortSignal.timeout(3000)` or `timeout 3s`), ephemeral ports (`port: 0`), loopback bindings, in-memory or OS-temp storage, and sanitized environment variables (`HOST`, `PORT`). Keep temporary probe files inside your conversation/session scratch directory or OS temp directory and clean up all temporary directories and child processes before finishing. Never write probe files to the workspace or `.scratch/`.

### 3. Verify uncertain findings via research

Before writing your report, verify any candidate finding where you are not 100% certain it is a real defect (versus an intentional design contract, documented exemption, or framework standard) following [`.agents/skills/research/SKILL.md`](../research/SKILL.md) when present or checking primary sources directly:

1. **Codebase ground truth.** Inspect repository ADRs, TSDoc contracts, testing guides, and commit history (`git log -S` or `git show`) for intentional contracts or documented exemptions.
2. **External primary sources.** When a finding depends on external libraries, protocols, accessibility specs, or runtime APIs, use search tools or a runtime check to verify official documentation rather than relying on training memory.
3. **Counter-evidence and filtering.** Run a minimal reproduction to confirm observable behavior, discard any candidate disproven by evidence, and cite the verified primary source, ADR, or commit in confirmed findings.

### 4. Report anatomy and completion reply

Write `.scratch/qa/<timestamp>-<slug>/{black,gray,white}-box-testing.md` with three required sections (`1` to `3`) and two conditional sections (`4` and `5`). When a conditional section has zero items, leave out its heading and body entirely rather than writing a "None required" or "Omitted" placeholder:

1. **Logic and scope understanding.** Concise axis-scoped inventory of audited entrypoints, seams, or internal logic. Include a compact Mermaid diagram (`flowchart TD`, `sequenceDiagram`, or `stateDiagram-v2`, at most 8 nodes) only when it clarifies non-trivial workflows, seams, or control flows.
2. **Existing test suite audit.** Assigned test files, pass/fail counts, level-separation compliance, and assertion/seam quality.
3. **Agent-executed live checks.** Exact test runner, static analysis, coverage, and delta probe commands executed, with exit codes and observed outputs.
4. **Problems, missing tests, and smells (include only when actionable findings exist).** Actionable defects, surviving mutants, missing tests, and standards violations requiring code or test changes (record compliant invariants in Section 3). Format each finding with **Category**, **Location** (`file:line` or entrypoint), **Failure trace** (concrete input, payload, or operator mutation, observed vs expected outcome, and primary-source or ADR citation), and **Recommended fix**.
5. **Human verification required (include only when modified behavior cannot be verified by machine).** Include a check only when all three conditions hold: (a) the target code or workflow was directly modified in the current scope, (b) the behavior requires human sensory judgment, interactive TTY ergonomics, or unmockable external credentials that no test runner, CLI probe, or headless browser in the workspace can verify, and (c) no automated test or delta probe already covers it. Sequence prerequisites first, followed by copy-pasteable commands with explicit flags and expected outcomes.

Reply to the coordinator in under 150 words confirming the written report path, test pass/fail counts, coverage or probe totals, and any verified findings or required human checks.
