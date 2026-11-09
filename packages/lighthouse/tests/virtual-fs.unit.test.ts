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
    it("intercepts ENOENT for locales directory and virtual directories on Lighthouse paths", () => {
      ensureLighthouseVirtualFs();

      // Locales directory fallback with trailing slash
      const locales = fs.readdirSync("/$bunfs/root/locales/");
      expect(locales).toEqual([...CANONICAL_LOCALES_FILES]);

      // Locales directory fallback without trailing slash (kills mutant on trailing slash check)
      const localesNoSlash = fs.readdirSync("/$bunfs/root/locales");
      expect(localesNoSlash).toEqual([...CANONICAL_LOCALES_FILES]);

      // Virtual gatherers directory fallback
      const gatherers = fs.readdirSync("/$bunfs/root/core/gather/gatherers");
      expect(Array.isArray(gatherers)).toBe(true);
      expect(gatherers).toContain("trace.js");

      // Virtual audits directory fallback
      const audits = fs.readdirSync("/$bunfs/root/core/audits");
      expect(Array.isArray(audits)).toBe(true);
      expect(audits).toContain("is-on-https.js");

      // Node_modules lighthouse path
      const nmLocales = fs.readdirSync(
        "/node_modules/lighthouse/core/lib/locales",
      );
      expect(nmLocales).toEqual([...CANONICAL_LOCALES_FILES]);

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

    it("does not intercept non-Lighthouse missing paths and allows ENOENT to be thrown", () => {
      ensureLighthouseVirtualFs();

      // Non-Lighthouse package.json must throw ENOENT
      expect(() =>
        fs.readFileSync("/tmp/other-package/package.json", "utf-8"),
      ).toThrow();

      // Non-Lighthouse styles.css must throw ENOENT
      expect(() =>
        fs.readFileSync("/nonexistent/other/styles.css", "utf-8"),
      ).toThrow();

      // Non-Lighthouse locales directory must throw ENOENT
      expect(() => fs.readdirSync("/nonexistent/path/locales/")).toThrow();
      expect(() => fs.readdirSync("/nonexistent/path/locales")).toThrow();

      // Non-Lighthouse gatherers/audits directory must throw ENOENT
      expect(() =>
        fs.readdirSync("/nonexistent/core/gather/gatherers"),
      ).toThrow();
      expect(() => fs.readdirSync("/nonexistent/core/audits")).toThrow();

      // Lighthouse path that does not match any virtual directory falls through to throw ENOENT
      expect(() =>
        fs.readdirSync("/$bunfs/root/unmatched-virtual-directory"),
      ).toThrow();

      // Lighthouse path that does not match any virtual asset falls through to throw ENOENT
      expect(() =>
        fs.readFileSync("/$bunfs/root/unmatched-virtual-asset.txt"),
      ).toThrow();

      restoreLighthouseVirtualFs();
    });

    it("preserves requested return shapes and respects options for readFileSync and readdirSync", () => {
      ensureLighthouseVirtualFs();

      // readFileSync without options returns Buffer
      const rawBuf = fs.readFileSync("/$bunfs/package.json");
      expect(Buffer.isBuffer(rawBuf)).toBe(true);
      expect(JSON.parse(rawBuf.toString("utf-8")).name).toBe("lighthouse");

      // readFileSync with string encoding returns string
      const strResult = fs.readFileSync("/$bunfs/package.json", "utf-8");
      expect(typeof strResult).toBe("string");
      expect(JSON.parse(strResult).name).toBe("lighthouse");

      // readFileSync with utf8 (no hyphen) returns string
      const utf8Result = fs.readFileSync("/$bunfs/package.json", "utf8");
      expect(typeof utf8Result).toBe("string");
      expect(JSON.parse(utf8Result).name).toBe("lighthouse");

      // readFileSync with null encoding in options returns Buffer
      const nullBufResult = fs.readFileSync("/$bunfs/package.json", {
        encoding: null,
      });
      expect(Buffer.isBuffer(nullBufResult)).toBe(true);

      // readFileSync with string buffer encoding returns Buffer
      const bufResult = fs.readFileSync(
        "/$bunfs/package.json",
        "buffer" as unknown as BufferEncoding,
      );
      expect(Buffer.isBuffer(bufResult)).toBe(true);

      // readFileSync with object options returns string
      const objResult = fs.readFileSync("/$bunfs/package.json", {
        encoding: "utf-8",
      });
      expect(typeof objResult).toBe("string");
      expect(JSON.parse(objResult).name).toBe("lighthouse");

      // readFileSync with alternative string encoding converts buffer to requested encoding
      const base64Result = fs.readFileSync("/$bunfs/package.json", "base64");
      expect(typeof base64Result).toBe("string");
      expect(Buffer.from(base64Result, "base64").toString("utf-8")).toContain(
        "lighthouse",
      );

      // readdirSync with withFileTypes: true returns Dirent[]
      const dirents = fs.readdirSync("/$bunfs/root/locales", {
        withFileTypes: true,
      });
      expect(Array.isArray(dirents)).toBe(true);
      expect(dirents.length).toBeGreaterThanOrEqual(48);
      const enUs = dirents.find((d) => d.name === "en-US.json");
      expect(enUs).toBeDefined();
      expect(typeof enUs?.isDirectory).toBe("function");
      expect(typeof enUs?.isFile).toBe("function");
      expect(enUs?.isDirectory()).toBe(false);
      expect(enUs?.isFile()).toBe(true);

      // readdirSync with directory entry in virtual dirs returns isDirectory: true
      const gathererDirents = fs.readdirSync(
        "/$bunfs/root/core/gather/gatherers",
        {
          withFileTypes: true,
        },
      );
      const seoDir = gathererDirents.find((d) => d.name === "seo");
      expect(seoDir).toBeDefined();
      expect(seoDir?.isDirectory()).toBe(true);
      expect(seoDir?.isFile()).toBe(false);

      // readdirSync with encoding: "buffer" returns Buffer[]
      const bufferEntries = fs.readdirSync("/$bunfs/root/locales", {
        encoding: "buffer",
      });
      expect(Buffer.isBuffer(bufferEntries[0])).toBe(true);
      expect(bufferEntries.map((b) => b.toString("utf-8"))).toContain(
        "en-US.json",
      );

      // readdirSync with string "buffer" encoding returns Buffer[]
      const bufferStringEntries = fs.readdirSync(
        "/$bunfs/root/locales",
        "buffer",
      );
      expect(Buffer.isBuffer(bufferStringEntries[0])).toBe(true);

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
