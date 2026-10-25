import type { EnvMap } from "@devtools/core";
import { resolveChromePathOverride, type BrowserConfigSeam } from "./config";
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
import type {
  BrowserResolution,
  BrowserSource,
  BrowserStatus,
  ResolveBrowserOptions,
} from "./types";

/**
 * Injectable probe dependencies for {@link resolveBrowserPath} and {@link getBrowserStatus}.
 *
 * @remarks
 * Enables deterministic testing of every tier in the browser resolution waterfall
 * without scanning the host machine's filesystem.
 */
export interface WaterfallDependencies {
  /** Overrides Tier 2.1 managed browser cache probing. */
  probeManagedCache?: (
    cacheDir?: string,
    env?: EnvMap,
    timeoutMs?: number,
  ) => Promise<{ path: string; version: string } | null>;
  /** Overrides Tier 2.2 system Chrome/Chromium discovery. */
  probeSystemInstallations?: () => Promise<string[]>;
  /** Overrides Tier 2.3 alternative Chromium browser (Edge, Brave) discovery. */
  probeAlternativeBrowsers?: (
    optionsOrEnv?: ProbeAlternativeBrowsersOptions | EnvMap,
    platformOverride?: NodeJS.Platform | string,
  ) => Promise<Array<CandidateBrowser<"edge" | "brave">>>;
  /** Overrides Tier 2.4 Playwright and Puppeteer cache discovery. */
  probeToolCaches?: (
    home?: string,
    envOrSeam?: EnvMap | BrowserConfigSeam,
  ) => Promise<Array<CandidateBrowser<"playwright" | "puppeteer">>>;
  /** Overrides `--version` binary verification. */
  verifyBrowserExecutable?: (
    path: string,
    timeoutMs?: number,
  ) => Promise<{ valid: boolean; version?: string }>;
}

type VerifyFn = (
  path: string,
  timeoutMs: number,
) => Promise<{ valid: boolean; version?: string }>;

/**
 * Iterates through candidate browser paths in order and returns the first candidate that passes verification.
 */
async function findFirstRunnableCandidate(
  candidates: Array<{ path: string; source: BrowserSource }>,
  verify: VerifyFn,
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

/**
 * Verifies an explicit browser path or throws {@link InvalidBrowserPathError} immediately on failure.
 */
async function verifyExplicitCandidateOrThrow(
  candidatePath: string,
  verify: VerifyFn,
  timeoutMs: number,
): Promise<BrowserResolution> {
  const check = await verify(candidatePath, timeoutMs);
  if (check.valid && check.version) {
    return {
      executablePath: candidatePath,
      version: check.version,
      source: "explicit",
    };
  }
  throw new InvalidBrowserPathError(
    candidatePath,
    "path does not exist, is not executable, or failed the --version check",
  );
}

/**
 * Evaluates Tier 1 explicit browser path overrides (`options.chromePath`, `DEVTOOLS_CHROME_PATH`, `CHROME_PATH`).
 */
async function resolveExplicitTier(
  options: ResolveBrowserOptions | undefined,
  seam: BrowserConfigSeam,
  verify: VerifyFn,
  timeoutMs: number,
): Promise<BrowserResolution | null> {
  if (options && "chromePath" in options && options.chromePath !== undefined) {
    const rawPath = options.chromePath;
    const trimmedPath = typeof rawPath === "string" ? rawPath.trim() : "";
    if (trimmedPath.length === 0) {
      throw new InvalidBrowserPathError(
        rawPath,
        "explicit --chrome-path cannot be empty or whitespace",
      );
    }
    return verifyExplicitCandidateOrThrow(trimmedPath, verify, timeoutMs);
  }

  const envPath = resolveChromePathOverride(seam);
  return envPath
    ? verifyExplicitCandidateOrThrow(envPath, verify, timeoutMs)
    : null;
}

/**
 * Probes Tier 2 system, alternative, and tool-cache browser candidates sequentially.
 */
async function probeFallbackCandidates(
  seam: BrowserConfigSeam,
  env: EnvMap | undefined,
  deps: WaterfallDependencies | undefined,
  verify: VerifyFn,
  timeoutMs: number,
): Promise<BrowserResolution | null> {
  const probeSystem = deps?.probeSystemInstallations ?? defaultProbeSystem;
  const systemCandidates = (await probeSystem()).map((path) => ({
    path,
    source: "system" as const,
  }));
  const systemHit = await findFirstRunnableCandidate(
    systemCandidates,
    verify,
    timeoutMs,
  );
  if (systemHit) return systemHit;

  const probeAlternatives =
    deps?.probeAlternativeBrowsers ?? defaultProbeAlternatives;
  const altHit = await findFirstRunnableCandidate(
    await probeAlternatives({ seam }),
    verify,
    timeoutMs,
  );
  if (altHit) return altHit;

  const probeToolCaches = deps?.probeToolCaches ?? defaultProbeToolCaches;
  return findFirstRunnableCandidate(
    await probeToolCaches(undefined, env),
    verify,
    timeoutMs,
  );
}

/**
 * Resolves a verified Chromium-compatible browser executable using a 3-tier waterfall:
 *
 * - **Tier 1 (Explicit Override)**: `--chrome-path` option, `DEVTOOLS_CHROME_PATH`, or `CHROME_PATH`.
 *   Halts immediately with {@link InvalidBrowserPathError} if the specified path is invalid.
 * - **Tier 2 (Automatic Discovery)**:
 *   1. Managed cache (`~/.devtools/browsers`)
 *   2. System Google Chrome / Chromium installations
 *   3. Alternative Chromium browsers (Microsoft Edge, Brave)
 *   4. Test runner caches (Playwright, Puppeteer)
 * - **Tier 3 (Terminal Remediation)**: Throws {@link BrowserNotFoundError} with installation guidance.
 *
 * @param options - Optional explicit path, cache directory, timeout, and environment seam overrides.
 * @param deps - Optional dependency injection seam for unit testing.
 * @returns Verified {@link BrowserResolution} containing executable path, version, and source tier.
 * @throws {InvalidBrowserPathError} When an explicit Tier 1 path is empty, missing, or fails verification.
 * @throws {BrowserNotFoundError} When no runnable Chromium browser is found across any tier.
 */
export async function resolveBrowserPath(
  options?: ResolveBrowserOptions,
  deps?: WaterfallDependencies,
): Promise<BrowserResolution> {
  const seam: BrowserConfigSeam = { env: options?.env };
  const timeoutMs = options?.timeoutMs ?? 3000;
  const verify = deps?.verifyBrowserExecutable ?? defaultVerify;

  const explicitHit = await resolveExplicitTier(
    options,
    seam,
    verify,
    timeoutMs,
  );
  if (explicitHit) {
    return explicitHit;
  }

  const probeCache = deps?.probeManagedCache ?? defaultProbeCache;
  const cacheHit = await probeCache(options?.cacheDir, options?.env, timeoutMs);
  if (cacheHit) {
    return {
      executablePath: cacheHit.path,
      version: cacheHit.version,
      source: "managed-cache",
    };
  }

  const fallbackHit = await probeFallbackCandidates(
    seam,
    options?.env,
    deps,
    verify,
    timeoutMs,
  );
  if (fallbackHit) {
    return fallbackHit;
  }

  throw new BrowserNotFoundError();
}

/**
 * Evaluates the browser resolution waterfall and returns a non-throwing {@link BrowserStatus} union.
 *
 * @param options - Optional explicit path, cache directory, timeout, and environment seam overrides.
 * @param deps - Optional dependency injection seam for unit testing.
 * @returns Discriminated {@link BrowserStatus} object (`{ found: true, ... }` or `{ found: false, code, error }`).
 */
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
    if (
      err instanceof BrowserNotFoundError ||
      err instanceof InvalidBrowserPathError
    ) {
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
