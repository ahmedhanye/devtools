import { Buffer } from "node:buffer";
import fs from "node:fs";
import { describe, expect, it } from "bun:test";
import {
  CANONICAL_LOCALES_FILES,
  ensureLighthouseVirtualFs,
  restoreLighthouseVirtualFs,
} from "../src/virtual-fs";

describe("virtual-fs", () => {
  it("exports canonical locale message files list containing en-US.json", () => {
    expect(CANONICAL_LOCALES_FILES.length).toBeGreaterThanOrEqual(48);
    expect(CANONICAL_LOCALES_FILES).toContain("en-US.json");
    expect(CANONICAL_LOCALES_FILES).toContain("en-GB.json");
  });

  describe("ensureLighthouseVirtualFs & restoreLighthouseVirtualFs", () => {
    it("intercepts ENOENT for locales directory and virtual directories", () => {
      ensureLighthouseVirtualFs();

      // Locales directory fallback with trailing slash
      const locales = fs.readdirSync("/nonexistent/path/locales/");
      expect(locales).toEqual([...CANONICAL_LOCALES_FILES]);

      // Locales directory fallback without trailing slash (kills mutant on line 84)
      const localesNoSlash = fs.readdirSync("/nonexistent/path/locales");
      expect(localesNoSlash).toEqual([...CANONICAL_LOCALES_FILES]);

      // Virtual gatherers directory fallback
      const gatherers = fs.readdirSync("/nonexistent/core/gather/gatherers");
      expect(Array.isArray(gatherers)).toBe(true);
      expect(gatherers).toContain("trace.js");

      // Virtual audits directory fallback
      const audits = fs.readdirSync("/nonexistent/core/audits");
      expect(Array.isArray(audits)).toBe(true);
      expect(audits).toContain("is-on-https.js");

      // Real filesystem reads still work
      const rootFiles = fs.readdirSync(".");
      expect(rootFiles).toContain("package.json");

      // Non-existent unrelated directory still throws ENOENT
      expect(() => fs.readdirSync("/completely/unrelated/path")).toThrow();

      // Non-string path argument throws ENOENT via defensive guard branches
      expect(() =>
        fs.readdirSync(
          Buffer.from("/nonexistent/buffer/dir") as unknown as string,
        ),
      ).toThrow();

      restoreLighthouseVirtualFs();
    });

    it("intercepts ENOENT for Lighthouse package.json and HTML/CSS/JS report assets", () => {
      ensureLighthouseVirtualFs();

      // package.json fallback
      const pkgRaw = fs.readFileSync("/$bunfs/package.json", "utf-8");
      const pkg = JSON.parse(pkgRaw);
      expect(pkg.name).toBe("lighthouse");
      expect(pkg.version).toBe("13.5.0");

      // HTML template assets
      const standaloneHtml = fs.readFileSync(
        "/$bunfs/root/../assets/standalone-template.html",
        "utf-8",
      );
      expect(typeof standaloneHtml).toBe("string");
      expect(standaloneHtml.length).toBeGreaterThan(0);

      const flowHtml = fs.readFileSync(
        "/$bunfs/root/../../flow-report/assets/standalone-flow-template.html",
        "utf-8",
      );
      expect(typeof flowHtml).toBe("string");
      expect(flowHtml.length).toBeGreaterThan(0);

      // CSS assets
      const reportCss = fs.readFileSync(
        "/$bunfs/root/../assets/styles.css",
        "utf-8",
      );
      expect(typeof reportCss).toBe("string");
      expect(reportCss.length).toBeGreaterThan(0);

      const flowCss = fs.readFileSync(
        "/$bunfs/root/../../flow-report/assets/styles.css",
        "utf-8",
      );
      expect(typeof flowCss).toBe("string");
      expect(flowCss.length).toBeGreaterThan(0);

      // JS report scripts
      const standaloneJs = fs.readFileSync(
        "/$bunfs/root/../../dist/report/standalone.js",
        "utf-8",
      );
      expect(typeof standaloneJs).toBe("string");
      expect(standaloneJs.length).toBeGreaterThan(0);

      const flowJs = fs.readFileSync(
        "/$bunfs/root/../../dist/report/flow.js",
        "utf-8",
      );
      expect(typeof flowJs).toBe("string");
      expect(flowJs.length).toBeGreaterThan(0);

      // Real filesystem reads work
      const realPkg = fs.readFileSync("package.json", "utf-8");
      expect(realPkg).toContain("devtools");

      // Non-existent unrelated file throws ENOENT
      expect(() =>
        fs.readFileSync("/unrelated/nonexistent/file.txt"),
      ).toThrow();

      // Non-string path argument throws ENOENT via defensive guard branches
      expect(() =>
        fs.readFileSync(
          Buffer.from("/nonexistent/buffer/file.txt") as unknown as string,
        ),
      ).toThrow();

      restoreLighthouseVirtualFs();
    });

    it("is idempotent when called multiple times and restores cleanly", () => {
      restoreLighthouseVirtualFs();
      const origReaddir = fs.readdirSync;
      const origReadFile = fs.readFileSync;

      ensureLighthouseVirtualFs();
      ensureLighthouseVirtualFs(); // second call should no-op

      expect(fs.readdirSync).not.toBe(origReaddir);
      expect(fs.readFileSync).not.toBe(origReadFile);

      restoreLighthouseVirtualFs();

      expect(fs.readdirSync).toBe(origReaddir);
      expect(fs.readFileSync).toBe(origReadFile);
    });
  });
});
