import "./declarations.d.ts";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import flowJs from "lighthouse/dist/report/flow.js" with { type: "text" };
import standaloneJs from "lighthouse/dist/report/standalone.js" with { type: "text" };
import flowReportTemplate from "lighthouse/flow-report/assets/standalone-flow-template.html" with { type: "text" };
import flowStylesCss from "lighthouse/flow-report/assets/styles.css" with { type: "text" };
import standaloneTemplate from "lighthouse/report/assets/standalone-template.html" with { type: "text" };
import reportStylesCss from "lighthouse/report/assets/styles.css" with { type: "text" };
import virtualDirsJson from "./virtual-dirs.json" with { type: "json" };

/**
 * Complete list of canonical locale message files bundled in `lighthouse@13.5.0`.
 *
 * In compiled Bun binaries, `fs.readdirSync('/$bunfs/root/locales/')` fails with `ENOENT`.
 * This list provides the static fallback list of filenames so Lighthouse's format module
 * can initialize without crashing.
 */
export const CANONICAL_LOCALES_FILES: readonly string[] = [
  "ar.json",
  "ar-XB.json",
  "bg.json",
  "ca.json",
  "cs.json",
  "da.json",
  "de.json",
  "el.json",
  "en-GB.json",
  "en-US.json",
  "en-XA.json",
  "en-XL.json",
  "es.json",
  "es-419.json",
  "fi.json",
  "fil.json",
  "fr.json",
  "he.json",
  "hi.json",
  "hr.json",
  "hu.json",
  "id.json",
  "it.json",
  "ja.json",
  "ko.json",
  "lt.json",
  "lv.json",
  "nl.json",
  "no.json",
  "pl.json",
  "pt.json",
  "pt-PT.json",
  "ro.json",
  "ru.json",
  "sk.json",
  "sl.json",
  "sr.json",
  "sr-Latn.json",
  "sv.json",
  "ta.json",
  "te.json",
  "th.json",
  "tr.json",
  "uk.json",
  "vi.json",
  "zh.json",
  "zh-HK.json",
  "zh-TW.json",
] as const;

const LIGHTHOUSE_PKG_FALLBACK = JSON.stringify({
  name: "lighthouse",
  version: "13.5.0",
});

const VIRTUAL_DIRS: Record<string, string[]> = virtualDirsJson;

let isVirtualFsInstalled = false;
let originalReaddirSync: typeof fs.readdirSync | null = null;
let originalReadFileSync: typeof fs.readFileSync | null = null;

function isLighthousePath(norm: string): boolean {
  return (
    norm.startsWith("lighthouse/") ||
    norm.includes("/$bunfs/") ||
    norm.includes("/node_modules/lighthouse/") ||
    norm.includes("/lighthouse/") ||
    norm.includes("shared/localization") ||
    norm.includes("flow-report")
  );
}

function isLocalesPath(targetPath: unknown): boolean {
  if (typeof targetPath !== "string") {
    return false;
  }
  const norm = targetPath.replaceAll("\\", "/");
  if (!isLighthousePath(norm)) {
    return false;
  }
  return norm.endsWith("/locales/") || norm.endsWith("/locales");
}

function getVirtualReaddir(targetPath: unknown): string[] | null {
  if (typeof targetPath !== "string") {
    return null;
  }
  const norm = targetPath.replaceAll("\\", "/").replace(/\/$/, "");
  if (!isLighthousePath(norm)) {
    return null;
  }
  for (const [key, files] of Object.entries(VIRTUAL_DIRS)) {
    if (norm.endsWith(key)) {
      return [...files];
    }
  }
  return null;
}

function getVirtualAssetContent(targetPath: unknown): string | null {
  if (typeof targetPath !== "string") {
    return null;
  }
  const norm = targetPath.replaceAll("\\", "/");
  if (!isLighthousePath(norm)) {
    return null;
  }
  if (norm.endsWith("/standalone-flow-template.html")) {
    return String(flowReportTemplate);
  }
  if (norm.endsWith("/standalone-template.html")) {
    return String(standaloneTemplate);
  }
  if (norm.includes("flow-report") && norm.endsWith("/styles.css")) {
    return flowStylesCss;
  }
  if (
    norm.endsWith("/report/assets/styles.css") ||
    norm.endsWith("/assets/styles.css") ||
    norm.endsWith("/styles.css")
  ) {
    return reportStylesCss;
  }
  if (norm.endsWith("/dist/report/flow.js") || norm.endsWith("/flow.js")) {
    return flowJs;
  }
  if (
    norm.endsWith("/dist/report/standalone.js") ||
    norm.endsWith("/standalone.js")
  ) {
    return standaloneJs;
  }
  if (norm.endsWith("/package.json")) {
    return LIGHTHOUSE_PKG_FALLBACK;
  }
  return null;
}

function formatReadFileResult(
  content: string,
  options?: unknown,
): string | Buffer {
  const encoding =
    typeof options === "string"
      ? options
      : (options as { encoding?: BufferEncoding | null } | undefined)?.encoding;

  if (!encoding || encoding === "buffer") {
    return Buffer.from(content, "utf-8");
  }
  if (encoding === "utf-8" || encoding === "utf8") {
    return content;
  }
  return Buffer.from(content, "utf-8").toString(encoding as BufferEncoding);
}

function createMockDirent(name: string, dirPath = ""): fs.Dirent {
  const isDir = !name.includes(".");
  return {
    name,
    parentPath: dirPath,
    path: dirPath,
    isFile: () => !isDir,
    isDirectory: () => isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
  } as unknown as fs.Dirent;
}

function formatReaddirResult(
  entries: string[],
  options?: unknown,
  dirPath = "",
): any {
  if (
    options &&
    typeof options === "object" &&
    (options as { withFileTypes?: boolean }).withFileTypes
  ) {
    return entries.map((name) => createMockDirent(name, dirPath));
  }

  const encoding =
    typeof options === "string"
      ? options
      : (options as { encoding?: string | null } | undefined)?.encoding;

  if (encoding === "buffer") {
    return entries.map((entry) => Buffer.from(entry, "utf-8"));
  }

  return entries;
}

export function ensureLighthouseVirtualFs(): void {
  if (isVirtualFsInstalled) {
    return;
  }
  isVirtualFsInstalled = true;
  originalReaddirSync = fs.readdirSync;
  originalReadFileSync = fs.readFileSync;

  const patchedReaddirSync: typeof fs.readdirSync = ((
    targetPath: fs.PathLike,
    options?: unknown,
  ): any => {
    try {
      return (originalReaddirSync as any)(targetPath, options);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        const pathStr = typeof targetPath === "string" ? targetPath : "";
        if (isLocalesPath(targetPath)) {
          return formatReaddirResult(
            [...CANONICAL_LOCALES_FILES],
            options,
            pathStr,
          );
        }
        const vDir = getVirtualReaddir(targetPath);
        if (vDir !== null) {
          return formatReaddirResult(vDir, options, pathStr);
        }
      }
      throw error;
    }
  }) as typeof fs.readdirSync;

  const patchedReadFileSync: typeof fs.readFileSync = ((
    targetPath: fs.PathLike,
    options?: unknown,
  ): any => {
    try {
      return (originalReadFileSync as any)(targetPath, options);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        const virtualContent = getVirtualAssetContent(targetPath);
        if (virtualContent !== null) {
          return formatReadFileResult(virtualContent, options);
        }
      }
      throw error;
    }
  }) as typeof fs.readFileSync;

  fs.readdirSync = patchedReaddirSync;
  fs.readFileSync = patchedReadFileSync;
}

// Auto-install virtual filesystem shims at import time so compiled binaries never hit ENOENT
ensureLighthouseVirtualFs();

export function restoreLighthouseVirtualFs(): void {
  if (!isVirtualFsInstalled) {
    return;
  }
  if (originalReaddirSync) {
    fs.readdirSync = originalReaddirSync;
    originalReaddirSync = null;
  }
  if (originalReadFileSync) {
    fs.readFileSync = originalReadFileSync;
    originalReadFileSync = null;
  }
  isVirtualFsInstalled = false;
}
