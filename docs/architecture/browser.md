# Browser Automation Architecture

Architecture, Chromium resolution waterfall algorithm, binary verification, and managed cache management for `packages/browser`.

## Package structure

`packages/browser` manages Chromium browser detection, resolution, and local installation:

```text
packages/browser/
├── src/
│   ├── browser/
│   │   ├── detector.ts        # Executable verification & path detection
│   │   ├── installer.ts       # Chrome for Testing downloader & unpacker
│   │   ├── types.ts           # Browser resolution & probe contracts
│   │   ├── errors.ts          # Actionable domain error classes
│   │   └── waterfall.ts       # 4-tier Chromium resolution waterfall
│   ├── config.ts              # Cache directory resolution & env seams
│   └── index.ts               # Public library entrypoint
└── tests/                     # Unit test suites with dependency injection
```

## The 4-tier Chromium resolution waterfall

When DevTools requires a Chromium browser executable (for headless scraping, automation, or testing), it resolves the binary path using a 4-tier waterfall algorithm:

```mermaid
flowchart TD
  Start([Resolve Browser Executable]) --> CheckOverride{Explicit Override?<br/>--chrome-path or DEVTOOLS_CHROME_PATH}
  CheckOverride -- Yes --> VerifyOverride[Verify Executable Path & Version]
  VerifyOverride -- Valid --> Found([Return BrowserResolution])
  VerifyOverride -- Invalid --> ErrorOverride[Throw InvalidBrowserPathError]
  CheckOverride -- No --> CheckCache{Managed Cache Probe<br/>~/.devtools/browsers/}
  CheckCache -- Found --> Found
  CheckCache -- Not Found --> CheckProbes{System & Tool Probes<br/>Chrome, Edge, Brave, Playwright}
  CheckProbes -- Found --> Found
  CheckProbes -- Not Found --> TerminalStop[Throw BrowserNotFoundError<br/>Remediation: devtools browser install]
```

### Waterfall evaluation tiers

1. **Tier 1: Explicit override**:
   - Checks CLI flag `--chrome-path` or environment variable `DEVTOOLS_CHROME_PATH`.
   - If present, verifies executable permissions and version output. Throws `InvalidBrowserPathError` if invalid.
2. **Tier 2: Managed cache probe**:
   - Inspects the local cache directory (`~/.devtools/browsers/` or resolved via `DEVTOOLS_BROWSERS_DIR`).
   - If an installed Chrome for Testing binary is present and executable, it is selected immediately.
3. **Tier 3: System and tool probes**:
   - Probes known operating system paths for existing Google Chrome, Microsoft Edge, Brave, or Chromium installations.
   - Probes Playwright/Puppeteer cache directories (`~/.cache/ms-playwright/`, `~/.cache/puppeteer/`).
4. **Tier 4: Actionable terminal remediation**:
   - If no compatible binary is discovered, throws `BrowserNotFoundError` detailing exactly which probes failed and instructing the user to run `devtools browser install`.

## Binary verification and cache management

1. **Executable verification**: `verifyBrowserExecutable` ensures candidate binaries have execute permissions (`X_OK`), runs a smoke test invocation (`--version`) with a strict execution timeout, and extracts version metadata.
2. **Managed installation**: `installBrowserExecutable` downloads the matching Chrome for Testing build archive from Google's official endpoints, verifies SHA256 checksums, unzips the payload into `~/.devtools/browsers/<version>/`, and sets executable permissions on the binary.
3. **Hermetic testing seam**: `waterfall.ts` accepts an optional `deps: WaterfallDependencies` seam to inject mock file probes and version testers, enabling deterministic testing without requiring physical browser downloads during CI runs.
