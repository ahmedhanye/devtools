import type { EnvMap } from "@devtools/core";
import { launch, Launcher } from "chrome-launcher";
import { resolveChromeSandboxDisabled } from "./config";
import type {
  BrowserResolution,
  BrowserSource,
  ResolveBrowserOptions,
} from "./types";
import { resolveBrowserPath } from "./waterfall";

/**
 * Minimal handle returned by an underlying Chrome launcher implementation.
 */
export interface LaunchedChromeHandle {
  /** Bound DevTools Protocol debugging port. */
  readonly port: number;
  /** Terminates the launched browser process and cleans up temporary user data directories. */
  kill: () => Promise<void> | void;
}

/**
 * Options forwarded to `chrome-launcher` when starting an isolated browser session.
 */
export interface LaunchChromeOptions {
  /** Absolute filesystem path to the Chromium executable. */
  chromePath: string;
  /** Command-line flags supplied to Chromium. */
  chromeFlags: string[];
  /** Requested debugging port (`0` selects an ephemeral port). */
  port: number;
  /** Launcher logging verbosity level. */
  logLevel: "silent";
  /** Whether `chrome-launcher` installs process-level `SIGINT` handlers. */
  handleSIGINT?: boolean;
  /** Whether `chrome-launcher` skips prepending duplicate default flags. */
  ignoreDefaultFlags?: boolean;
}

/**
 * Active Chromium process session managed by `@devtools/browser`.
 */
export interface BrowserSession {
  /** Bound DevTools Protocol debugging port. */
  readonly port: number;
  /** Absolute filesystem path to the running browser binary. */
  readonly executablePath: string;
  /** Reported browser version string. */
  readonly version: string;
  /** Discovery tier that supplied the browser binary. */
  readonly source: BrowserSource;
  /** Detaches abort listeners and terminates the Chromium process cleanly. */
  kill(): Promise<void>;
  /** Disposes this session automatically when used with `await using`. */
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * Configuration options for launching a headless Chromium session via {@link launchBrowserSession}.
 */
export interface LaunchBrowserSessionOptions {
  /** Pre-resolved browser metadata to skip redundant discovery across multi-run batches. */
  browser?: BrowserResolution;
  /** Explicit Chromium executable override (`--chrome-path`). */
  chromePath?: string;
  /** Custom managed browser cache directory overriding `~/.devtools/browsers`. */
  cacheDir?: string;
  /** Explicit override to force `--no-sandbox` (`true`) or keep sandboxing enabled (`false`). */
  disableSandbox?: boolean;
  /** Additional Chromium CLI flags appended after standard headless defaults. */
  additionalFlags?: readonly string[];
  /** Isolated environment variable map overriding `process.env`. */
  env?: EnvMap;
  /** Optional cancellation signal aborting browser resolution, launch, and active sessions. */
  signal?: AbortSignal;
}

/**
 * Injectable dependency seams for testing {@link launchBrowserSession} without launching Chrome.
 */
export interface BrowserSessionDependencies {
  /** Overrides browser discovery when `options.browser` is not pre-resolved. */
  resolveBrowser?: (
    options?: ResolveBrowserOptions,
  ) => Promise<BrowserResolution>;
  /** Overrides `chrome-launcher` process creation. */
  launchChrome?: (
    options: LaunchChromeOptions,
  ) => Promise<LaunchedChromeHandle>;
  /** Overrides `Launcher.defaultFlags()`. */
  defaultFlags?: () => string[];
  /** Overrides `process.getuid` when evaluating sandbox policy. */
  getuid?: () => number | undefined;
}

function throwIfLaunchAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Browser launch was aborted", {
      cause: signal.reason,
    });
  }
}

/**
 * Resolves (unless pre-resolved) and launches an isolated headless Chromium session
 * on an ephemeral port (`port: 0`) with `ignoreDefaultFlags: true`, `handleSIGINT: false`,
 * sandbox policy enforcement, and `AbortSignal` teardown.
 *
 * @param options - Optional pre-resolved browser metadata, sandbox override, flags, env, and abort signal.
 * @param deps - Optional dependency injection seams for hermetic unit testing.
 * @returns Active {@link BrowserSession} handle.
 * @throws {Error} When `options.signal` is aborted or browser discovery/launch fails.
 */
export async function launchBrowserSession(
  options: LaunchBrowserSessionOptions = {},
  deps: BrowserSessionDependencies = {},
): Promise<BrowserSession> {
  throwIfLaunchAborted(options.signal);

  const browser =
    options.browser ??
    (await (deps.resolveBrowser ?? resolveBrowserPath)({
      chromePath: options.chromePath,
      cacheDir: options.cacheDir,
      env: options.env,
      ...(options.signal ? { signal: options.signal } : {}),
    }));

  throwIfLaunchAborted(options.signal);

  const disableSandbox = resolveChromeSandboxDisabled({
    disableSandbox: options.disableSandbox,
    env: options.env,
    getuid: deps.getuid,
  });

  const getDefaultFlags = deps.defaultFlags ?? (() => Launcher.defaultFlags());
  const launchChrome = deps.launchChrome ?? launch;

  const chromeFlags = [
    ...getDefaultFlags(),
    "--headless=new",
    ...(disableSandbox ? ["--no-sandbox"] : []),
    "--disable-gpu",
    "--disable-dev-shm-usage",
    ...(options.additionalFlags ?? []),
  ];

  const launchedChrome = await launchChrome({
    chromePath: browser.executablePath,
    chromeFlags,
    port: 0,
    logLevel: "silent",
    handleSIGINT: false,
    ignoreDefaultFlags: true,
  });

  if (options.signal?.aborted) {
    await launchedChrome.kill();
    throwIfLaunchAborted(options.signal);
  }

  const onAbort = (): void => {
    try {
      void Promise.resolve(launchedChrome.kill()).catch(() => {});
    } catch {
      // Final session kill() retries process termination
    }
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });

  const kill = async (): Promise<void> => {
    options.signal?.removeEventListener("abort", onAbort);
    await launchedChrome.kill();
  };

  return {
    port: launchedChrome.port,
    executablePath: browser.executablePath,
    version: browser.version,
    source: browser.source,
    kill,
    async [Symbol.asyncDispose]() {
      await kill();
    },
  };
}
