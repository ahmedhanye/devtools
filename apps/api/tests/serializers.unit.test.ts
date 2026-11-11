import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LighthouseRunRow } from "@devtools/db";
import {
  serializeLighthouseRunDetail,
  serializeLighthouseRunListItem,
} from "../src/lighthouse/serializers";

const DEFAULT_ROW: LighthouseRunRow = {
  id: "run-ok",
  url: "https://example.com",
  finalUrl: "https://example.com/",
  formFactor: "mobile",
  throttlingMethod: "simulate",
  performanceScore: 94,
  accessibilityScore: 100,
  bestPracticesScore: 92,
  seoScore: 98,
  lcpMs: 1240,
  cls: 0.02,
  tbtMs: 45,
  fcpMs: 780,
  siMs: 1150,
  ttfbMs: 95,
  summaryJson: {
    lcpElement: null,
    lcpPhases: null,
    clsCulprits: [],
    insights: [],
    failedAudits: [],
    runWarnings: [],
    runtimeError: null,
    medianMetadata: null,
  },
  jsonReportPath: "/tmp/run-ok/report.json",
  htmlReportPath: "/tmp/run-ok/report.html",
  durationMs: 4100,
  createdAt: new Date("2026-10-29T20:00:00Z"),
};

describe("Lighthouse API Run DTO Serializers", () => {
  let artifactsDir: string;

  beforeEach(() => {
    artifactsDir = mkdtempSync(join(tmpdir(), "devtools-api-serializers-"));
  });

  afterEach(() => {
    rmSync(artifactsDir, { recursive: true, force: true });
  });

  it("serializes run rows to sanitized list/detail DTOs without filesystem paths and handles malformed summaryJson", () => {
    const runDir = join(artifactsDir, "run-ok");
    mkdirSync(runDir, { recursive: true });
    const validHtmlPath = join(runDir, "report.html");
    writeFileSync(validHtmlPath, "<html><body>OK</body></html>", "utf-8");

    const row: LighthouseRunRow = {
      ...DEFAULT_ROW,
      htmlReportPath: validHtmlPath,
    };

    const listItem = serializeLighthouseRunListItem(row, artifactsDir);
    expect(listItem.hasHtmlReport).toBe(true);
    expect(listItem.createdAt).toBe("2026-10-29T20:00:00.000Z");
    expect("htmlReportPath" in listItem).toBe(false);
    expect("summaryJson" in listItem).toBe(false);

    const detail = serializeLighthouseRunDetail(row, artifactsDir);
    expect(detail.summary).toEqual(row.summaryJson);
    expect("jsonReportPath" in detail).toBe(false);

    const corruptedDetail = serializeLighthouseRunDetail(
      {
        ...row,
        htmlReportPath: join(tmpdir(), "outside-report.html"),
        summaryJson: "bad-json" as unknown as LighthouseRunRow["summaryJson"],
      },
      artifactsDir,
    );
    expect(corruptedDetail.hasHtmlReport).toBe(false);
    expect(corruptedDetail.summary.insights).toEqual([]);
  });
});
