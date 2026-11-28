import { API_ERROR_CODES } from "@devtools/core";
import { afterEach, describe, expect, it } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCanonicalArtifactsDir } from "../src/config";
import {
  AuditCancelledError,
  InvalidAuditOptionsError,
  LighthouseRunNotFoundError,
  WorkerExecutionError,
  type LighthouseRunListRecord,
  type LighthouseRunRecord,
} from "../src/contracts";
import { EMPTY_LIGHTHOUSE_RUN_SUMMARY } from "../src/domain";
import {
  serializeAuditError,
  serializeLighthouseRunDetail,
  serializeLighthouseRunListItem,
} from "../src/serializers";

function makeRecord(
  artifactsDir: string,
  overrides: Partial<LighthouseRunRecord> = {},
): LighthouseRunRecord {
  const htmlPath = join(artifactsDir, "run-1", "report.html");
  return {
    id: "run-1",
    url: "https://example.com/",
    finalUrl: "https://example.com/",
    formFactor: "mobile",
    throttlingMethod: "simulate",
    performanceScore: 95,
    accessibilityScore: 100,
    bestPracticesScore: 100,
    seoScore: 92,
    lcpMs: 1200,
    cls: 0.01,
    tbtMs: 50,
    fcpMs: 800,
    siMs: 1100,
    ttfbMs: 120,
    summaryJson: EMPTY_LIGHTHOUSE_RUN_SUMMARY,
    jsonReportPath: join(artifactsDir, "run-1", "report.json"),
    htmlReportPath: htmlPath,
    durationMs: 2400,
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    ...overrides,
  };
}

describe("Lighthouse Run Domain Serializers", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function createTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "devtools-lh-ser-"));
    tempDirs.push(dir);
    return dir;
  }

  it("serializes list items from LighthouseRunListRecord without exposing disk paths or summaryJson", () => {
    const artifactsDir = createTempDir();
    const runDir = join(artifactsDir, "run-1");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "report.html"), "<html></html>");

    const record = makeRecord(artifactsDir);
    const listRecord: LighthouseRunListRecord = {
      id: record.id,
      url: record.url,
      finalUrl: record.finalUrl,
      formFactor: record.formFactor,
      throttlingMethod: record.throttlingMethod,
      performanceScore: record.performanceScore,
      accessibilityScore: record.accessibilityScore,
      bestPracticesScore: record.bestPracticesScore,
      seoScore: record.seoScore,
      lcpMs: record.lcpMs,
      cls: record.cls,
      tbtMs: record.tbtMs,
      fcpMs: record.fcpMs,
      siMs: record.siMs,
      ttfbMs: record.ttfbMs,
      jsonReportPath: record.jsonReportPath,
      htmlReportPath: record.htmlReportPath,
      durationMs: record.durationMs,
      createdAt: record.createdAt,
    };

    const canonicalBase = resolveCanonicalArtifactsDir(artifactsDir);
    const dto = serializeLighthouseRunListItem(
      listRecord,
      artifactsDir,
      canonicalBase,
    );
    expect(dto.hasHtmlReport).toBe(true);
    expect(dto.id).toBe("run-1");
    expect(dto.createdAt).toBe("2026-06-01T12:00:00.000Z");
    expect("jsonReportPath" in dto).toBe(false);
    expect("htmlReportPath" in dto).toBe(false);
    expect("summaryJson" in dto).toBe(false);
  });

  it("marks hasHtmlReport false when canonicalBase is null, report is missing, or symlink escapes artifactsDir", () => {
    const artifactsDir = createTempDir();
    const outsideDir = createTempDir();
    const runDir = join(artifactsDir, "run-1");
    mkdirSync(runDir, { recursive: true });
    const outsideHtml = join(outsideDir, "secret.html");
    writeFileSync(outsideHtml, "secret");

    const escapedSymlink = join(runDir, "report.html");
    symlinkSync(outsideHtml, escapedSymlink);

    const record = makeRecord(artifactsDir, { htmlReportPath: escapedSymlink });
    expect(
      serializeLighthouseRunListItem(record, artifactsDir, null).hasHtmlReport,
    ).toBe(false);
    expect(
      serializeLighthouseRunListItem(record, artifactsDir).hasHtmlReport,
    ).toBe(false);
  });

  it("serializes run detail reusing parsed summaryJson or defaulting empty summary when null", () => {
    const artifactsDir = createTempDir();
    const record = makeRecord(artifactsDir, { summaryJson: null });
    const detail = serializeLighthouseRunDetail(record, artifactsDir);
    expect(detail.summary).toEqual(EMPTY_LIGHTHOUSE_RUN_SUMMARY);
    expect(detail.hasHtmlReport).toBe(false);

    const customSummary = {
      ...EMPTY_LIGHTHOUSE_RUN_SUMMARY,
      runWarnings: ["Throttling disabled"],
    };
    const withSummary = makeRecord(artifactsDir, {
      summaryJson: customSummary,
    });
    expect(
      serializeLighthouseRunDetail(withSummary, artifactsDir, null).summary,
    ).toEqual(customSummary);
  });

  it("maps typed domain errors, Error subclasses, strings, and fallback errors cleanly", () => {
    const validationErr = new InvalidAuditOptionsError("bad url");
    const cancelledErr = new AuditCancelledError("cancelled by user");
    const notFoundErr = new LighthouseRunNotFoundError("abc");
    const workerErr = new WorkerExecutionError("boom");

    expect(serializeAuditError(validationErr)).toEqual({
      code: validationErr.code,
      message: "bad url",
    });
    expect(serializeAuditError(cancelledErr)).toEqual({
      code: cancelledErr.code,
      message: "cancelled by user",
    });
    expect(serializeAuditError(notFoundErr)).toEqual({
      code: notFoundErr.code,
      message: notFoundErr.message,
    });
    expect(serializeAuditError(workerErr)).toEqual({
      code: workerErr.code,
      message: "boom",
    });
    expect(serializeAuditError(new Error("unexpected failure"))).toEqual({
      code: API_ERROR_CODES.INTERNAL_ERROR,
      message: "unexpected failure",
    });
    expect(serializeAuditError(new Error(""))).toEqual({
      code: API_ERROR_CODES.INTERNAL_ERROR,
      message: "Lighthouse audit execution failed",
    });
    expect(
      serializeAuditError(Object.assign(new Error("x"), { code: "" })),
    ).toEqual({
      code: API_ERROR_CODES.INTERNAL_ERROR,
      message: "x",
    });
    expect(serializeAuditError("")).toEqual({
      code: API_ERROR_CODES.INTERNAL_ERROR,
      message: "Lighthouse audit execution failed",
    });
    expect(serializeAuditError("raw string failure")).toEqual({
      code: API_ERROR_CODES.INTERNAL_ERROR,
      message: "raw string failure",
    });
    expect(serializeAuditError(42)).toEqual({
      code: API_ERROR_CODES.INTERNAL_ERROR,
      message: "Lighthouse audit execution failed",
    });
  });
});
