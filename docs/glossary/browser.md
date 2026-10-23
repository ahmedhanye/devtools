# Browser Automation Context

Domain terms for Chromium binary resolution, Chrome for Testing distribution, and local browser cache management.

## Language

**Browser Resolution Waterfall**:
The strict 3-tier precedence algorithm (explicit flag/env → managed cache & system probes → terminal remediation stop) that resolves a Chromium binary.
_Avoid_: Browser detection chain, chrome locator pipeline, browser discovery fallback

**Managed Browser Cache**:
The centralized directory (`~/.devtools/browsers/`) hosting downloaded Chrome for Testing binaries across all local devtools workspaces.
_Avoid_: Download cache, browser store, local chromium dir

**Chrome for Testing (CfT)**:
Google's dedicated Chromium distribution specifically engineered for automated testing, distributed as `chrome-headless-shell` and `chrome`.
_Avoid_: Test chromium, headless chrome binary, puppeteer browser

**Explicit Browser Override**:
A developer-supplied binary path provided via the `--chrome-path` CLI option or the `DEVTOOLS_CHROME_PATH` / `CHROME_PATH` environment variables that bypasses auto-detection.
_Avoid_: Custom chrome binary, manual browser path, chrome flag

**Managed Cache Override**:
A custom filesystem directory designated via `--path` or `DEVTOOLS_BROWSERS_DIR` that replaces the default `~/.devtools/browsers/` location for downloaded Chrome for Testing binaries.
_Avoid_: Custom download dir, browser store path, alternate cache location
