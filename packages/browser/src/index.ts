/**
 * Chromium browser discovery waterfall, executable verification, session launching, and managed installation utilities.
 *
 * @packageDocumentation
 */
export {
  resolveChromeSandboxDisabled,
  type ResolveChromeSandboxOptions,
} from "./config";
export { BrowserNotFoundError, InvalidBrowserPathError } from "./errors";
export { installBrowser } from "./installer";
export {
  launchBrowserSession,
  type BrowserSession,
  type BrowserSessionDependencies,
  type LaunchBrowserSessionOptions,
} from "./launcher";
export type {
  BrowserResolution,
  BrowserSource,
  BrowserStatus,
  InstallBrowserOptions,
  InstalledBrowser,
  ResolveBrowserOptions,
} from "./types";
export { getBrowserStatus, resolveBrowserPath } from "./waterfall";
