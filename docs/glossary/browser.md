# Browser Automation Context

Domain terms for Chromium binary discovery, Chrome for Testing distribution, and local browser cache management.

## Language

**Browser Resolution Waterfall**:
The strict three-tier precedence sequence (explicit override, managed cache and system probes, then terminal remediation stop) that resolves a Chromium binary.
_Avoid_: Browser detection chain, chrome locator pipeline, browser discovery fallback

**Managed Browser Cache**:
The centralized local directory hosting downloaded Chrome for Testing binaries shared across local DevTools workspaces.
_Avoid_: Download cache, browser store, local chromium dir

**Chrome for Testing (CfT)**:
Google's dedicated Chromium distribution engineered for automated browser testing.
_Avoid_: Test chromium, headless chrome binary, puppeteer browser

**Explicit Browser Override**:
A developer-supplied Chromium binary path that bypasses automatic browser detection.
_Avoid_: Custom chrome binary, manual browser path, chrome flag

**Managed Cache Override**:
A custom filesystem directory that replaces the default Managed Browser Cache location for downloaded Chrome for Testing binaries.
_Avoid_: Custom download dir, browser store path, alternate cache location
