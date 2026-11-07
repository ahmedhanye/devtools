import "./declarations.d.ts";

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

function isLocalesPath(targetPath: unknown): boolean {
  if (typeof targetPath !== "string") {
    return false;
  }
  const norm = targetPath.replaceAll("\\", "/");
  return norm.endsWith("/locales/") || norm.endsWith("/locales");
}

function getVirtualReaddir(targetPath: unknown): string[] | null {
  if (typeof targetPath !== "string") {
    return null;
  }
  const norm = targetPath.replaceAll("\\", "/").replace(/\/$/, "");
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
  if (norm.endsWith("/standalone-flow-template.html")) {
    return flowReportTemplate;
  }
  if (norm.endsWith("/standalone-template.html")) {
    return standaloneTemplate;
  }
  if (norm.includes("flow-report") && norm.endsWith("/styles.css")) {
    return flowStylesCss;
  }
  if (norm.endsWith("/styles.css")) {
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

export async function ensureLighthouseVirtualFs(): Promise<void> {
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
        if (isLocalesPath(targetPath)) {
          return [...CANONICAL_LOCALES_FILES];
        }
        const vDir = getVirtualReaddir(targetPath);
        if (vDir !== null) {
          return vDir;
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
          return virtualContent;
        }
      }
      throw error;
    }
  }) as typeof fs.readFileSync;

  fs.readdirSync = patchedReaddirSync;
  fs.readFileSync = patchedReadFileSync;

  const { registerBundledModules } = await import("./bundled-modules");
  await registerBundledModules();
}

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
