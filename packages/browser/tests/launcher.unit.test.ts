import { describe, expect, it } from "bun:test";
import { Launcher } from "chrome-launcher";
import { InvalidBrowserPathError } from "../src/errors";
import {
  launchBrowserSession,
  type LaunchChromeOptions,
} from "../src/launcher";
import type { BrowserResolution } from "../src/types";

const MOCK_BROWSER: BrowserResolution = {
  executablePath: "/mock/chromium",
  version: "Chromium 136.0.0",
  source: "explicit",
};

describe("launchBrowserSession", () => {
  it("uses pre-resolved browser without calling resolveBrowser and configures ignoreDefaultFlags + sandbox flags", async () => {
    let resolveCalled = false;
    let capturedLaunchOpts: LaunchChromeOptions | undefined;
    let killed = false;

    const session = await launchBrowserSession(
      {
        browser: MOCK_BROWSER,
        disableSandbox: true,
        additionalFlags: ["--window-size=1280,720"],
      },
      {
        resolveBrowser: async () => {
          resolveCalled = true;
          return MOCK_BROWSER;
        },
        launchChrome: async (opts) => {
          capturedLaunchOpts = opts;
          return {
            port: 49152,
            kill: async () => {
              killed = true;
            },
          };
        },
      },
    );

    expect(resolveCalled).toBe(false);
    expect(capturedLaunchOpts?.chromePath).toBe("/mock/chromium");
    expect(capturedLaunchOpts?.port).toBe(0);
    expect(capturedLaunchOpts?.logLevel).toBe("silent");
    expect(capturedLaunchOpts?.handleSIGINT).toBe(false);
    expect(capturedLaunchOpts?.ignoreDefaultFlags).toBe(true);

    const expectedDefaults = Launcher.defaultFlags();
    for (const flag of expectedDefaults) {
      expect(capturedLaunchOpts?.chromeFlags).toContain(flag);
    }
    expect(capturedLaunchOpts?.chromeFlags).toContain("--headless=new");
    expect(capturedLaunchOpts?.chromeFlags).toContain("--no-sandbox");
    expect(capturedLaunchOpts?.chromeFlags).toContain("--disable-gpu");
    expect(capturedLaunchOpts?.chromeFlags).toContain(
      "--disable-dev-shm-usage",
    );
    expect(capturedLaunchOpts?.chromeFlags).toContain("--window-size=1280,720");

    expect(session.port).toBe(49152);
    expect(session.executablePath).toBe("/mock/chromium");
    expect(session.version).toBe("Chromium 136.0.0");
    expect(session.source).toBe("explicit");

    await session.kill();
    expect(killed).toBe(true);
  });

  it("omits --no-sandbox when sandbox is enabled and supports await using disposal", async () => {
    let capturedFlags: string[] = [];
    let disposed = false;

    {
      await using session = await launchBrowserSession(
        {
          chromePath: "/mock/bin",
          cacheDir: "/mock/cache",
          env: { CI: "" },
          disableSandbox: false,
        },
        {
          resolveBrowser: async (opts) => {
            expect(opts?.chromePath).toBe("/mock/bin");
            expect(opts?.cacheDir).toBe("/mock/cache");
            return MOCK_BROWSER;
          },
          defaultFlags: () => ["--custom-default"],
          launchChrome: async (opts) => {
            capturedFlags = opts.chromeFlags;
            return {
              port: 49153,
              kill: () => {
                disposed = true;
              },
            };
          },
        },
      );
      expect(session.port).toBe(49153);
    }

    expect(capturedFlags).toEqual([
      "--custom-default",
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
    ]);
    expect(disposed).toBe(true);
  });

  it("rejects pre-aborted signals and abort-during-resolve without launching Chrome", async () => {
    const preAborted = new AbortController();
    preAborted.abort("already aborted");

    let launchCalled = false;
    await expect(
      launchBrowserSession(
        { signal: preAborted.signal },
        {
          launchChrome: async () => {
            launchCalled = true;
            return { port: 1, kill: () => {} };
          },
        },
      ),
    ).rejects.toThrow("Browser launch was aborted");
    expect(launchCalled).toBe(false);

    const midResolve = new AbortController();
    await expect(
      launchBrowserSession(
        { signal: midResolve.signal },
        {
          resolveBrowser: async () => {
            midResolve.abort();
            return MOCK_BROWSER;
          },
          launchChrome: async () => {
            launchCalled = true;
            return { port: 1, kill: () => {} };
          },
        },
      ),
    ).rejects.toThrow("Browser launch was aborted");
    expect(launchCalled).toBe(false);
  });

  it("kills Chrome immediately if signal aborts while launchChrome is in flight", async () => {
    const controller = new AbortController();
    let killCount = 0;

    await expect(
      launchBrowserSession(
        { browser: MOCK_BROWSER, signal: controller.signal },
        {
          launchChrome: async () => {
            controller.abort();
            return {
              port: 50000,
              kill: async () => {
                killCount += 1;
              },
            };
          },
        },
      ),
    ).rejects.toThrow("Browser launch was aborted");

    expect(killCount).toBe(1);
  });

  it("wires active abort listener with resilient kill() error handling and removes it on kill()", async () => {
    for (const mode of ["reject", "throw"] as const) {
      const controller = new AbortController();
      let killCount = 0;

      const session = await launchBrowserSession(
        { browser: MOCK_BROWSER, signal: controller.signal },
        {
          launchChrome: async () => ({
            port: 50001,
            kill: () => {
              killCount += 1;
              if (killCount === 1) {
                if (mode === "reject") {
                  return Promise.reject(new Error("async kill failure"));
                }
                throw new Error("sync kill failure");
              }
              return Promise.resolve();
            },
          }),
        },
      );

      controller.abort();
      await Promise.resolve();
      expect(killCount).toBe(1);

      await session.kill();
      expect(killCount).toBe(2);
    }

    const cleanController = new AbortController();
    let activeKills = 0;
    const session = await launchBrowserSession(
      { browser: MOCK_BROWSER, signal: cleanController.signal },
      {
        launchChrome: async () => ({
          port: 50002,
          kill: () => {
            activeKills += 1;
          },
        }),
      },
    );
    await session.kill();
    cleanController.abort();
    expect(activeKills).toBe(1);
  });

  it("falls back to default resolveBrowserPath when options.browser and deps.resolveBrowser are omitted", async () => {
    await expect(
      launchBrowserSession({
        chromePath: "/nonexistent/devtools-missing-chrome-binary",
      }),
    ).rejects.toBeInstanceOf(InvalidBrowserPathError);
  });

  it("forwards env and signal to resolveBrowser and derives --no-sandbox from resolved policy when disableSandbox is omitted", async () => {
    const controller = new AbortController();
    let capturedResolveEnv: Record<string, string | undefined> | undefined;
    let capturedResolveSignal: AbortSignal | undefined;
    let ciFlags: string[] = [];
    let rootFlags: string[] = [];
    let standardFlags: string[] = [];

    {
      await using ciSession = await launchBrowserSession(
        {
          chromePath: "/mock/bin",
          cacheDir: "/mock/cache",
          env: { CHROME_NO_SANDBOX: "1" },
          signal: controller.signal,
        },
        {
          getuid: () => 1000,
          resolveBrowser: async (opts) => {
            capturedResolveEnv = opts?.env;
            capturedResolveSignal = opts?.signal;
            return MOCK_BROWSER;
          },
          launchChrome: async (opts) => {
            ciFlags = opts.chromeFlags;
            return { port: 49200, kill: async () => {} };
          },
        },
      );
      expect(ciSession.port).toBe(49200);
    }

    expect(capturedResolveEnv).toEqual({ CHROME_NO_SANDBOX: "1" });
    expect(capturedResolveSignal).toBe(controller.signal);
    expect(ciFlags).toContain("--no-sandbox");

    {
      await using rootSession = await launchBrowserSession(
        {
          browser: MOCK_BROWSER,
          env: {},
        },
        {
          getuid: () => 0,
          launchChrome: async (opts) => {
            rootFlags = opts.chromeFlags;
            return { port: 49201, kill: async () => {} };
          },
        },
      );
      expect(rootSession.port).toBe(49201);
    }
    expect(rootFlags).toContain("--no-sandbox");

    {
      await using standardSession = await launchBrowserSession(
        {
          browser: MOCK_BROWSER,
          env: {},
        },
        {
          getuid: () => 1000,
          launchChrome: async (opts) => {
            standardFlags = opts.chromeFlags;
            return { port: 49202, kill: async () => {} };
          },
        },
      );
      expect(standardSession.port).toBe(49202);
    }
    expect(standardFlags).not.toContain("--no-sandbox");
  });
});
