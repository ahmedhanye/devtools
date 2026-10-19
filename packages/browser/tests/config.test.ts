import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import {
  resolveChromePathOverride,
  resolveCwd,
  resolveLocalAppData,
  resolveManagedCacheDir,
  resolvePlatform,
  resolvePlaywrightCustomPath,
  resolvePuppeteerCacheDir,
  resolveSeam,
  resolveWindowsProgramFiles,
  resolveXdgCacheHome,
  type BrowserConfigSeam,
} from "../src/config";

describe("packages/browser/src/config", () => {
  describe("resolveManagedCacheDir", () => {
    it("returns default cache directory when no env override is present", () => {
      const seam: BrowserConfigSeam = { env: {} };
      expect(resolveManagedCacheDir(undefined, seam)).toBe(
        join(homedir(), ".devtools", "browsers"),
      );
    });

    it("respects DEVTOOLS_BROWSERS_DIR from seam.env", () => {
      const seam: BrowserConfigSeam = {
        env: { DEVTOOLS_BROWSERS_DIR: "/custom/browsers/path" },
      };
      expect(resolveManagedCacheDir(undefined, seam)).toBe(
        "/custom/browsers/path",
      );
    });

    it("ignores empty or whitespace DEVTOOLS_BROWSERS_DIR", () => {
      const seam: BrowserConfigSeam = {
        env: { DEVTOOLS_BROWSERS_DIR: "   " },
      };
      expect(resolveManagedCacheDir(undefined, seam)).toBe(
        join(homedir(), ".devtools", "browsers"),
      );
    });

    it("prefers explicit dir argument over env override", () => {
      const seam: BrowserConfigSeam = {
        env: { DEVTOOLS_BROWSERS_DIR: "/env/browsers" },
      };
      expect(resolveManagedCacheDir("/explicit/dir", seam)).toBe(
        "/explicit/dir",
      );
    });
  });

  describe("resolveChromePathOverride", () => {
    it("prefers DEVTOOLS_CHROME_PATH over CHROME_PATH", () => {
      const seam: BrowserConfigSeam = {
        env: {
          DEVTOOLS_CHROME_PATH: "/opt/devtools-chrome",
          CHROME_PATH: "/opt/generic-chrome",
        },
      };
      expect(resolveChromePathOverride(seam)).toBe("/opt/devtools-chrome");
    });

    it("falls back to CHROME_PATH when DEVTOOLS_CHROME_PATH is empty or whitespace", () => {
      const seam: BrowserConfigSeam = {
        env: {
          DEVTOOLS_CHROME_PATH: "   ",
          CHROME_PATH: "/opt/generic-chrome",
        },
      };
      expect(resolveChromePathOverride(seam)).toBe("/opt/generic-chrome");
    });

    it("returns undefined when neither variable is set or valid", () => {
      const seam: BrowserConfigSeam = { env: {} };
      expect(resolveChromePathOverride(seam)).toBeUndefined();
    });
  });

  describe("resolvePlatform", () => {
    it("returns seam.platform() when specified", () => {
      const seam: BrowserConfigSeam = {
        platform: () => "win32",
      };
      expect(resolvePlatform(seam)).toBe("win32");
    });
  });

  describe("resolveCwd", () => {
    it("prefers INIT_CWD from env when present", () => {
      const seam: BrowserConfigSeam = {
        env: { INIT_CWD: "/workspace/init-root" },
        cwd: () => "/fallback/cwd",
      };
      expect(resolveCwd(seam)).toBe("/workspace/init-root");
    });

    it("falls back to seam.cwd() when INIT_CWD is unset", () => {
      const seam: BrowserConfigSeam = {
        env: {},
        cwd: () => "/custom/cwd",
      };
      expect(resolveCwd(seam)).toBe("/custom/cwd");
    });
  });

  describe("resolveWindowsProgramFiles", () => {
    it("reads PROGRAMFILES and PROGRAMFILES(X86) from seam.env", () => {
      const seam: BrowserConfigSeam = {
        env: {
          PROGRAMFILES: "D:\\ProgramFiles",
          "PROGRAMFILES(X86)": "D:\\ProgramFilesX86",
        },
      };
      const res = resolveWindowsProgramFiles(seam);
      expect(res.programFiles).toBe("D:\\ProgramFiles");
      expect(res.programFilesX86).toBe("D:\\ProgramFilesX86");
    });

    it("falls back to standard Windows defaults when unset", () => {
      const seam: BrowserConfigSeam = { env: {} };
      const res = resolveWindowsProgramFiles(seam);
      expect(res.programFiles).toBe("C:\\Program Files");
      expect(res.programFilesX86).toBe("C:\\Program Files (x86)");
    });
  });

  describe("resolvePuppeteerCacheDir", () => {
    it("returns PUPPETEER_CACHE_DIR from seam.env when set", () => {
      const seam: BrowserConfigSeam = {
        env: { PUPPETEER_CACHE_DIR: "/custom/puppeteer" },
      };
      expect(resolvePuppeteerCacheDir("/fake/home", seam)).toBe(
        "/custom/puppeteer",
      );
    });

    it("falls back to home/.cache/puppeteer when unset", () => {
      const seam: BrowserConfigSeam = { env: {} };
      expect(resolvePuppeteerCacheDir("/fake/home", seam)).toBe(
        join("/fake/home", ".cache", "puppeteer"),
      );
    });
  });

  describe("playwright and system cache seams", () => {
    it("resolves PLAYWRIGHT_BROWSERS_PATH from seam.env", () => {
      expect(
        resolvePlaywrightCustomPath({
          env: { PLAYWRIGHT_BROWSERS_PATH: " /custom/pw " },
        }),
      ).toBe("/custom/pw");
      expect(resolvePlaywrightCustomPath({ env: {} })).toBeUndefined();
    });

    it("resolves LOCALAPPDATA and XDG_CACHE_HOME from seam.env", () => {
      expect(
        resolveLocalAppData({
          env: { LOCALAPPDATA: "C:\\Users\\Mock\\AppData" },
        }),
      ).toBe("C:\\Users\\Mock\\AppData");
      expect(resolveLocalAppData({ env: {} })).toBeUndefined();

      expect(
        resolveXdgCacheHome({ env: { XDG_CACHE_HOME: "/mock/xdg" } }),
      ).toBe("/mock/xdg");
      expect(resolveXdgCacheHome({ env: {} })).toBeUndefined();
    });

    it("resolves Windows ProgramFiles directories with defaults and env overrides", () => {
      const def = resolveWindowsProgramFiles({ env: {} });
      expect(def.programFiles).toBe("C:\\Program Files");
      expect(def.programFilesX86).toBe("C:\\Program Files (x86)");

      const custom = resolveWindowsProgramFiles({
        env: {
          PROGRAMFILES: "D:\\ProgramFiles",
          "PROGRAMFILES(X86)": "D:\\ProgramFilesX86",
        },
      });
      expect(custom.programFiles).toBe("D:\\ProgramFiles");
      expect(custom.programFilesX86).toBe("D:\\ProgramFilesX86");
    });
  });

  describe("resolveSeam", () => {
    it("handles functional platform and edge inputs", () => {
      const funcPlat: BrowserConfigSeam = {
        platform: () => "linux",
      };
      expect(resolveSeam(funcPlat)).toEqual(funcPlat);

      expect(resolveSeam(undefined, "darwin")).toEqual({
        platform: expect.any(Function),
      });
      expect(resolveSeam(null as unknown as undefined)).toBeUndefined();
      expect(
        resolveSeam("invalid-string" as unknown as undefined),
      ).toBeUndefined();
    });

    it("preserves cwd function for cwd-only seams and mixed env seams", () => {
      const cwdFn = () => "/custom/project/dir";
      const seamWithCwd = resolveSeam({ cwd: cwdFn });
      expect(seamWithCwd?.cwd?.()).toBe("/custom/project/dir");

      const seamWithEnvAndCwd = resolveSeam({
        env: { FOO: "bar" },
        cwd: cwdFn,
      });
      expect(seamWithEnvAndCwd?.env).toEqual({ FOO: "bar" });
      expect(seamWithEnvAndCwd?.cwd?.()).toBe("/custom/project/dir");
    });
  });
});
