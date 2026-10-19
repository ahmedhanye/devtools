import {
  probeAlternativeBrowsers as defaultProbeAlternatives,
  probeManagedCache as defaultProbeCache,
  probeSystemInstallations as defaultProbeSystem,
  probeToolCaches as defaultProbeToolCaches,
  verifyBrowserExecutable as defaultVerify,
  type CandidateBrowser,
  type ProbeAlternativeBrowsersOptions,
} from "./detector";
import { BrowserNotFoundError, InvalidBrowserPathError } from "./errors";
import { resolveChromePathOverride, type BrowserConfigSeam } from "../config";
import type {
  BrowserResolution,
  BrowserSource,
  BrowserStatus,
  ResolveBrowserOptions,
} from "./types";

export interface WaterfallDependencies {
  probeManagedCache?: (
    cacheDir?: string,
    env?: Record<string, string | undefined>,
    timeoutMs?: number,
  ) => Promise<{ path: string; version: string } | null>;
  probeSystemInstallations?: () => Promise<string[]>;
  probeAlternativeBrowsers?: (
    optionsOrEnv?:
      ProbeAlternativeBrowsersOptions | Record<string, string | undefined>,
    platformOverride?: NodeJS.Platform | string,
  ) => Promise<Array<CandidateBrowser<"edge" | "brave">>>;
  probeToolCaches?: (
    home?: string,
    envOrSeam?: Record<string, string | undefined> | BrowserConfigSeam,
  ) => Promise<Array<CandidateBrowser<"playwright" | "puppeteer">>>;
  verifyBrowserExecutable?: (
    path: string,
    timeoutMs?: number,
  ) => Promise<{ valid: boolean; version?: string }>;
}

async function findFirstRunnableCandidate(
  candidates: Array<{ path: string; source: BrowserSource }>,
  verify: (
    path: string,
    timeoutMs: number,
  ) => Promise<{ valid: boolean; version?: string }>,
  timeoutMs: number,
): Promise<BrowserResolution | null> {
  for (const candidate of candidates) {
    const check = await verify(candidate.path, timeoutMs);
    if (check.valid && check.version) {
      return {
        executablePath: candidate.path,
        version: check.version,
        source: candidate.source,
      };
    }
  }
  return null;
}

export async function resolveBrowserPath(
  options?: ResolveBrowserOptions,
  deps?: WaterfallDependencies,
): Promise<BrowserResolution> {
  const seam: BrowserConfigSeam = { env: options?.env };
  const timeoutMs = options?.timeoutMs ?? 3000;

  const verify = deps?.verifyBrowserExecutable ?? defaultVerify;
  const probeCache = deps?.probeManagedCache ?? defaultProbeCache;
  const probeSystem = deps?.probeSystemInstallations ?? defaultProbeSystem;
  const probeAlternatives =
    deps?.probeAlternativeBrowsers ?? defaultProbeAlternatives;
  const probeToolCaches = deps?.probeToolCaches ?? defaultProbeToolCaches;

  // --- Tier 1: Explicit Path / Flags / Environment Variables ---
  // If options.chromePath was explicitly supplied, validate it strictly.
  // Empty or whitespace strings must fail fast rather than falling through to Tier 2.
  if (options && "chromePath" in options && options.chromePath !== undefined) {
    const rawPath = options.chromePath;
    const trimmedPath = typeof rawPath === "string" ? rawPath.trim() : "";
    if (trimmedPath.length === 0) {
      throw new InvalidBrowserPathError(
        rawPath,
        "explicit --chrome-path cannot be empty or whitespace",
      );
    }
    const check = await verify(trimmedPath, timeoutMs);
    if (check.valid && check.version) {
      return {
        executablePath: trimmedPath,
        version: check.version,
        source: "explicit",
      };
    }
    // Strict halt: Do NOT fall through to Tier 2
    throw new InvalidBrowserPathError(
      trimmedPath,
      "path does not exist, is not executable, or failed the --version check",
    );
  }

  // Next, inspect environment variable overrides in order of precedence:
  // DEVTOOLS_CHROME_PATH then CHROME_PATH.
  const envPath = resolveChromePathOverride(seam);

  if (envPath) {
    const check = await verify(envPath, timeoutMs);
    if (check.valid && check.version) {
      return {
        executablePath: envPath,
        version: check.version,
        source: "explicit",
      };
    }
    // Strict halt: Do NOT fall through to Tier 2
    throw new InvalidBrowserPathError(
      envPath,
      "path does not exist, is not executable, or failed the --version check",
    );
  }

  // --- Tier 2: Managed Cache & System Discovery ---

  // 1. Managed Browser Cache (~/.devtools/browsers/)
  const cacheHit = await probeCache(options?.cacheDir, options?.env, timeoutMs);
  if (cacheHit) {
    return {
      executablePath: cacheHit.path,
      version: cacheHit.version,
      source: "managed-cache",
    };
  }

  // 2. System Chrome / Chromium installations
  const systemCandidates = await probeSystem();
  const systemHit = await findFirstRunnableCandidate(
    systemCandidates.map((path) => ({ path, source: "system" as const })),
    verify,
    timeoutMs,
  );
  if (systemHit) {
    return systemHit;
  }

  // 3. Alternative Chromium browsers (Microsoft Edge, Brave)
  const altCandidates = await probeAlternatives({ seam });
  const altHit = await findFirstRunnableCandidate(
    altCandidates,
    verify,
    timeoutMs,
  );
  if (altHit) {
    return altHit;
  }

  // 4. Test tool caches (Playwright, Puppeteer)
  const toolCandidates = await probeToolCaches(undefined, options?.env);
  const toolHit = await findFirstRunnableCandidate(
    toolCandidates,
    verify,
    timeoutMs,
  );
  if (toolHit) {
    return toolHit;
  }

  // --- Tier 3: Terminal Remediation Stop ---
  throw new BrowserNotFoundError();
}

export async function getBrowserStatus(
  options?: ResolveBrowserOptions,
  deps?: WaterfallDependencies,
): Promise<BrowserStatus> {
  try {
    const res = await resolveBrowserPath(options, deps);
    return {
      found: true,
      path: res.executablePath,
      version: res.version,
      source: res.source,
    };
  } catch (err: unknown) {
    if (err instanceof BrowserNotFoundError) {
      return {
        found: false,
        code: err.code,
        error: err.message,
      };
    }
    if (err instanceof InvalidBrowserPathError) {
      return {
        found: false,
        code: err.code,
        error: err.message,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      found: false,
      error: message,
    };
  }
}
