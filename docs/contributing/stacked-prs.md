# Stacked Pull Requests

Stacked pull requests decompose large changesets into an ordered chain of smaller, focused branches and dependent pull requests (`main <- layer-1 <- layer-2 <- ... <- layer-N`). Each layer compiles independently, passes test suites, and can be reviewed in isolation.

---

## 1. When to Stack Pull Requests

Use stacked pull requests when:

- **Size threshold:** A changeset exceeds **5,000 lines of code** or **80 files**, staying well below automated review limits and human comprehension thresholds.
- **Multi-layer architecture:** A feature spans distinct architectural tiers that should be reviewed and verified sequentially:
  1. **Layer 1 (Foundation / Governance / Tooling / Schemas):** Core types, database schemas, or build configurations.
  2. **Layer 2 (Shared Packages / Domain Logic):** Shared libraries and runtime seams with unit and integration tests.
  3. **Layer 3 (Backend Applications):** API services, CLI commands, or daemons consuming underlying packages.
  4. **Layer 4 (Frontend / Documentation Platform):** Web UI components, visual test suites, and documentation wiring.

When work fits comfortably under 5,000 lines of code and fewer than 80 files within a single vertical slice, use a single pull request instead.

---

## 2. Prerequisites & Setup

Stacked workflows in this repository utilize GitHub's official `gh-stack` CLI extension.

1. Install the extension:
   ```bash
   gh extension install github/gh-stack
   ```
2. Configure git prerequisites:
   ```bash
   git config rerere.enabled true
   git config remote.pushDefault origin
   ```

---

## 3. Creating and Managing Stacks

### Step 1: Branch Naming and Initialization

Create branch names reflecting the tracking issue and layer order: `<issue>-<topic>/<layer-number>-<layer-name>`.

For example:

```bash
git checkout -b 102-audit/01-schemas-and-core
# Make changes and commit
git checkout -b 102-audit/02-lighthouse-runner
# Make changes and commit
git checkout -b 102-audit/03-cli-commands
```

Initialize or add branches to a stack:

```bash
# Initialize a new stack tracking these branches
gh stack init 102-audit/01-schemas-and-core 102-audit/02-lighthouse-runner 102-audit/03-cli-commands

# Or append an additional branch to an active stack
gh stack add 102-audit/04-frontend-dashboard
```

View the local and remote stack status:

```bash
gh stack view
```

### Step 2: Layer Verification

Before submitting, verify that every layer compiles and passes automated checks against its base branch:

```bash
# For the first layer (based on main):
bun run verify

# For intermediate layers (based on a preceding stack branch):
BASE_REF="<parent-layer-branch>" bun run verify
```

### Step 3: Submitting the Stack for Review

Submit the entire stack to GitHub:

```bash
gh stack submit --auto --open
```

> **Note:** The `--open` flag ensures pull requests are created ready for review rather than as draft PRs.

### Step 4: PR Metadata & Issue Linking

Each pull request in the stack must adhere to standard title and template conventions:

- **Titles:** Follow Conventional Commits format (`feat(cli): add audit command`).
- **Issue linking:**
  - Intermediate layers link using `Part of #<issue>` in the pull request body so merging earlier layers does not prematurely close the issue.
  - Only the final top-level pull request contains `Closes #<issue>`.
- **Updating pull request details:** Update pull request titles and bodies using GitHub CLI REST calls:
  ```bash
  gh api --method PATCH repos/{owner}/{repo}/pulls/<pr_number> -f title="<title>" -F body=@<body-file>
  ```

---

## 4. Cascading Updates & Rebases

When review feedback requires changing a lower branch in the stack:

1. Check out the target branch:
   ```bash
   gh stack checkout 102-audit/01-schemas-and-core
   ```
2. Make code edits and commit:
   ```bash
   git commit -m "fix(core): update budget validation schema"
   ```
3. Rebase all upstack branches automatically:
   ```bash
   gh stack rebase --upstack
   ```
4. If a conflict occurs, resolve files and continue:
   ```bash
   git add <resolved-files>
   gh stack rebase --continue
   ```
   _(To cancel an in-progress rebase and cleanly restore all branches, run `gh stack rebase --abort`.)_
5. Synchronize all branch updates and push with lease:
   ```bash
   gh stack sync --prune
   ```

---

## 5. Merging a Stack

Once all layers are approved, CI checks pass, and review threads are resolved:

Merge all pull requests in the stack atomically via:

```bash
gh stack merge [<stack-number> | <pr-number>] --yes --squash
```

This executes an all-or-nothing merge of the stack in dependency order.
