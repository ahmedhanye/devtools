import { describe, expect, it } from "bun:test";
import { AuditCancelledError } from "../src";
import { throwIfAborted } from "../src/abort";
import {
  buildLighthouseConfig,
  DESKTOP_THROTTLING,
  extractReportStrings,
} from "../src/iteration";

describe("Lighthouse Iteration Pure Configuration & Report Helpers", () => {
  it("buildLighthouseConfig constructs mobile and desktop configs with default 4 categories and throttling overrides", () => {
    const mobileCfg = buildLighthouseConfig({
      formFactor: "mobile",
      throttlingMethod: "simulate",
      categories: ["performance", "accessibility", "best-practices", "seo"],
    });
    expect(mobileCfg.extends).toBe("lighthouse:default");
    expect(mobileCfg.settings?.formFactor).toBe("mobile");
    expect(mobileCfg.settings?.throttlingMethod).toBe("simulate");
    expect(mobileCfg.settings?.onlyCategories).toEqual([
      "performance",
      "accessibility",
      "best-practices",
      "seo",
    ]);

    const desktopCfg = buildLighthouseConfig({
      formFactor: "desktop",
      throttlingMethod: "devtools",
      categories: ["performance"],
    });
    expect(desktopCfg.settings?.formFactor).toBe("desktop");
    expect(desktopCfg.settings?.throttlingMethod).toBe("devtools");
    expect(desktopCfg.settings?.throttling).toEqual(DESKTOP_THROTTLING);
    expect(desktopCfg.settings?.screenEmulation?.mobile).toBe(false);
  });

  it("extractReportStrings extracts reports and handles single-string fallback cleanly", () => {
    const lhr = {
      requestedUrl: "https://example.com",
      finalDisplayedUrl: "https://example.com/",
    };
    const reportJson = JSON.stringify(lhr, null, 2);
    const reportHtml = "<!doctype html><html><body>Report</body></html>";

    const arrayResult = extractReportStrings(lhr, [reportJson, reportHtml]);
    expect(arrayResult.reportJson).toBe(reportJson);
    expect(arrayResult.reportHtml).toBe(reportHtml);

    const fallbackReports = extractReportStrings(
      lhr,
      reportJson,
      () => "<html>rendered-fallback</html>",
    );
    expect(fallbackReports.reportJson).toBe(reportJson);
    expect(fallbackReports.reportHtml).toBe("<html>rendered-fallback</html>");

    const nonStringFallback = extractReportStrings(
      lhr,
      undefined as unknown as string,
      () => "<html>rendered-undefined</html>",
    );
    expect(nonStringFallback.reportJson).toBe(reportJson);
    expect(nonStringFallback.reportHtml).toBe(
      "<html>rendered-undefined</html>",
    );
  });

  it("AuditCancelledError and throwIfAborted enforce structured cancellation metadata", () => {
    const reason = new Error("shutdown requested");
    const err = new AuditCancelledError("Audit stopped", { cause: reason });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AuditCancelledError");
    expect(err.code).toBe("AUDIT_CANCELLED");
    expect(err.exitCode).toBe(1);
    expect(err.cause).toBe(reason);

    expect(() => throwIfAborted(undefined)).not.toThrow();

    const controller = new AbortController();
    expect(() => throwIfAborted(controller.signal)).not.toThrow();

    controller.abort(reason);
    let caught: unknown;
    try {
      throwIfAborted(controller.signal);
    } catch (thrown) {
      caught = thrown;
    }
    expect(caught).toBeInstanceOf(AuditCancelledError);
    expect((caught as AuditCancelledError).code).toBe("AUDIT_CANCELLED");
    expect((caught as AuditCancelledError).cause).toBe(reason);
  });
});
