import { describe, expect, it } from "bun:test";
import { normalizeLhr } from "../src/normalizer";
import {
  LighthouseRunSummaryDataSchema,
  type LighthouseMedianMetadata,
  type RawLighthouseResult,
} from "../src/types";

describe("normalizeLhr (Lighthouse v13.5.0 LHR normalization)", () => {
  it("extracts 4 rounded 0-100 category scores and 6 Core Web Vitals from standard v13.5.0 LHR", () => {
    const lhr: RawLighthouseResult = {
      requestedUrl: "http://127.0.0.1:4123/",
      finalDisplayedUrl: "http://127.0.0.1:4123/home",
      categories: {
        performance: { id: "performance", score: 0.916 },
        accessibility: { id: "accessibility", score: 1 },
        "best-practices": { id: "best-practices", score: 0.833 },
        seo: { id: "seo", score: null },
      },
      audits: {
        "largest-contentful-paint": { numericValue: 1842.5 },
        "cumulative-layout-shift": { numericValue: 0.042 },
        "total-blocking-time": { numericValue: 65.2 },
        "first-contentful-paint": { numericValue: 910.1 },
        "speed-index": { numericValue: 1450.8 },
        "server-response-time": { numericValue: 112.4 },
      },
    };

    const result = normalizeLhr(lhr);
    expect(result.requestedUrl).toBe("http://127.0.0.1:4123/");
    expect(result.finalUrl).toBe("http://127.0.0.1:4123/home");
    expect(result.scores).toEqual({
      performanceScore: 92,
      accessibilityScore: 100,
      bestPracticesScore: 83,
      seoScore: null,
    });
    expect(result.metrics).toEqual({
      lcpMs: 1842.5,
      cls: 0.042,
      tbtMs: 65.2,
      fcpMs: 910.1,
      siMs: 1450.8,
      ttfbMs: 112.4,
    });
    expect(
      LighthouseRunSummaryDataSchema.safeParse(result.summary).success,
    ).toBe(true);
    expect(
      LighthouseRunSummaryDataSchema.safeParse({
        ...result.summary,
        unexpectedExtraField: true,
      }).success,
    ).toBe(false);
  });

  it("resolves TTFB via 3-source fallback chain (server-response-time -> document-latency-insight -> metrics)", () => {
    const fromInsight: RawLighthouseResult = {
      requestedUrl: "https://example.com",
      finalUrl: "https://example.com/",
      audits: {
        "server-response-time": {
          scoreDisplayMode: "error",
        },
        "document-latency-insight": {
          id: "document-latency-insight",
          title: "Document request latency",
          description: "First network request latency",
          details: {
            type: "checklist",
            debugData: {
              type: "debugdata",
              serverResponseTime: 188.5,
            },
          },
        },
      },
    };
    expect(normalizeLhr(fromInsight).metrics.ttfbMs).toBe(188.5);

    const fromMetrics: RawLighthouseResult = {
      requestedUrl: "https://example.com",
      audits: {
        metrics: {
          details: {
            type: "debugdata",
            items: [{ timeToFirstByte: 245.7 }],
          },
        },
      },
    };
    expect(normalizeLhr(fromMetrics).metrics.ttfbMs).toBe(245.7);

    const missingAll: RawLighthouseResult = {
      audits: {},
    };
    expect(normalizeLhr(missingAll).metrics.ttfbMs).toBeNull();
  });

  it("extracts LCP NodeValue and 4 phase subparts from lcp-breakdown-insight", () => {
    const lhr: RawLighthouseResult = {
      requestedUrl: "https://example.com",
      audits: {
        "lcp-breakdown-insight": {
          id: "lcp-breakdown-insight",
          title: "LCP breakdown",
          description: "Each subpart has specific improvement strategies.",
          score: 0,
          scoreDisplayMode: "numeric",
          replacesAudits: ["largest-contentful-paint-element"],
          details: {
            type: "list",
            items: [
              {
                type: "table",
                items: [
                  { subpart: "timeToFirstByte", duration: 120.5 },
                  { subpart: "resourceLoadDelay", duration: 45.2 },
                  { subpart: "resourceLoadDuration", duration: 310.8 },
                  { subpart: "elementRenderDelay", duration: 85.1 },
                ],
              },
              {
                type: "node",
                lhId: "page-1-IMG",
                path: "1,HTML,1,BODY,0,MAIN,0,IMG",
                selector: "main > img.hero-banner",
                nodeLabel: "Hero Banner",
                snippet: '<img class="hero-banner" src="/hero.jpg">',
                boundingRect: {
                  top: 64,
                  bottom: 464,
                  left: 20,
                  right: 820,
                  width: 800,
                  height: 400,
                },
              },
            ],
          },
        },
      },
    };

    const { summary } = normalizeLhr(lhr);
    expect(summary.lcpElement).toEqual({
      selector: "main > img.hero-banner",
      snippet: '<img class="hero-banner" src="/hero.jpg">',
      nodeLabel: "Hero Banner",
      path: "1,HTML,1,BODY,0,MAIN,0,IMG",
      lhId: "page-1-IMG",
      boundingRect: {
        top: 64,
        bottom: 464,
        left: 20,
        right: 820,
        width: 800,
        height: 400,
      },
    });
    expect(summary.lcpPhases).toEqual({
      timeToFirstByteMs: 120.5,
      resourceLoadDelayMs: 45.2,
      resourceLoadDurationMs: 310.8,
      elementRenderDelayMs: 85.1,
    });
  });

  it("falls back to lcp-discovery-insight and legacy largest-contentful-paint-element when lcp-breakdown-insight is absent", () => {
    const fromDiscovery: RawLighthouseResult = {
      audits: {
        "lcp-discovery-insight": {
          id: "lcp-discovery-insight",
          title: "LCP request discovery",
          description: "Optimize LCP discovery",
          details: {
            type: "list",
            items: [
              { type: "checklist", items: {} },
              {
                type: "node",
                selector: "header > h1.title",
                snippet: '<h1 class="title">Welcome</h1>',
                nodeLabel: "Welcome",
              },
            ],
          },
        },
      },
    };
    const discoverySummary = normalizeLhr(fromDiscovery).summary;
    expect(discoverySummary.lcpElement?.selector).toBe("header > h1.title");
    expect(discoverySummary.lcpElement?.boundingRect).toBeNull();
    expect(discoverySummary.lcpPhases).toBeNull();

    const fromLegacyTable: RawLighthouseResult = {
      audits: {
        "largest-contentful-paint-element": {
          details: {
            type: "table",
            items: [
              {
                node: {
                  type: "node",
                  selector: "div.legacy-hero",
                  snippet: '<div class="legacy-hero">',
                  boundingRect: { top: 0 }, // Incomplete boundingRect -> null
                },
              },
            ],
          },
        },
      },
    };
    const legacyNormalized = normalizeLhr(fromLegacyTable);
    expect(legacyNormalized.summary.lcpElement?.selector).toBe(
      "div.legacy-hero",
    );
    expect(legacyNormalized.summary.lcpElement?.boundingRect).toBeNull();

    const malformedLcpBreakdown: RawLighthouseResult = {
      audits: {
        "lcp-breakdown-insight": {
          details: {
            type: "list",
            items: [
              null,
              { type: "not-a-table" },
              {
                type: "table",
                items: [{ subpart: "unknownSubpart", duration: 10 }],
              },
            ],
          },
        },
      },
    };
    const malformedSummary = normalizeLhr(malformedLcpBreakdown).summary;
    expect(malformedSummary.lcpElement).toBeNull();
    expect(malformedSummary.lcpPhases).toBeNull();
  });

  it("extracts CLS culprits from cls-culprits-insight while filtering out Row 0 text Total summary rows, and falls back to layout-shifts", () => {
    const lhrWithInsight: RawLighthouseResult = {
      audits: {
        "cls-culprits-insight": {
          id: "cls-culprits-insight",
          title: "Layout shift culprits",
          description: "Layout shifts occur when elements move.",
          score: 0,
          scoreDisplayMode: "numeric",
          details: {
            type: "list",
            items: [
              {
                type: "table",
                items: [
                  {
                    node: { type: "text", value: "Total" },
                    score: 0.185,
                  },
                  {
                    node: {
                      type: "node",
                      lhId: "page-2-DIV",
                      selector: "div.promo-banner",
                      snippet: '<div class="promo-banner">',
                      nodeLabel: "Promo Banner",
                      path: "1,HTML,1,BODY,1,DIV",
                      boundingRect: {
                        top: 100,
                        bottom: 220,
                        left: 0,
                        right: 412,
                        width: 412,
                        height: 120,
                      },
                    },
                    score: 0.145,
                    subItems: {
                      type: "subitems",
                      items: [
                        {
                          cause: "Unsized image",
                          extra: {
                            type: "node",
                            selector: "img.ad-graphic",
                          },
                        },
                        {
                          cause: "Web font loaded",
                          extra: {
                            type: "url",
                            value: "https://example.com/fonts/inter.woff2",
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    };

    const { summary } = normalizeLhr(lhrWithInsight);
    expect(summary.clsCulprits).toHaveLength(1);
    expect(summary.clsCulprits[0]).toEqual({
      element: {
        selector: "div.promo-banner",
        snippet: '<div class="promo-banner">',
        nodeLabel: "Promo Banner",
        path: "1,HTML,1,BODY,1,DIV",
        lhId: "page-2-DIV",
        boundingRect: {
          top: 100,
          bottom: 220,
          left: 0,
          right: 412,
          width: 412,
          height: 120,
        },
      },
      score: 0.145,
      causes: [
        {
          cause: "Unsized image",
          url: null,
          selector: "img.ad-graphic",
        },
        {
          cause: "Web font loaded",
          url: "https://example.com/fonts/inter.woff2",
          selector: null,
        },
      ],
    });

    const lhrWithFallback: RawLighthouseResult = {
      audits: {
        "layout-shifts": {
          details: {
            type: "table",
            items: [
              {
                node: {
                  type: "node",
                  selector: "footer.site-footer",
                },
                score: 0.055,
              },
            ],
          },
        },
      },
    };
    const fallbackSummary = normalizeLhr(lhrWithFallback).summary;
    expect(fallbackSummary.clsCulprits).toHaveLength(1);
    expect(fallbackSummary.clsCulprits[0]?.element.selector).toBe(
      "footer.site-footer",
    );
    expect(fallbackSummary.clsCulprits[0]?.score).toBe(0.055);

    const lhrWithEmptyInsightAndMalformedSubItems: RawLighthouseResult = {
      audits: {
        "cls-culprits-insight": {
          details: {
            type: "list",
            items: [
              {
                type: "table",
                items: [
                  {
                    node: {
                      type: "node",
                      selector: "section.card",
                    },
                    score: 0.02,
                    subItems: { type: "subitems" }, // Missing items array
                  },
                ],
              },
            ],
          },
        },
      },
    };
    expect(
      normalizeLhr(lhrWithEmptyInsightAndMalformedSubItems).summary
        .clsCulprits[0]?.causes,
    ).toEqual([]);

    const lhrWithZeroCulpritsInInsight: RawLighthouseResult = {
      audits: {
        "cls-culprits-insight": {
          details: {
            type: "list",
            items: [
              {
                type: "table",
                items: [{ node: { type: "text", value: "Total" }, score: 0 }],
              },
            ],
          },
        },
      },
    };
    expect(
      normalizeLhr(lhrWithZeroCulpritsInInsight).summary.clsCulprits,
    ).toEqual([]);
  });

  it("extracts and prioritizes *-insight audits and non-insight failedAudits along with warnings, runtimeError, and medianMetadata", () => {
    const medianMetadata: LighthouseMedianMetadata = {
      totalRuns: 3,
      selectedRunIndex: 1,
      medianFcpMs: 900,
      medianInteractiveMs: 1800,
      runDistances: [
        {
          runIndex: 0,
          fcpMs: 850,
          interactiveMs: 1700,
          distanceSquared: 12500,
        },
        { runIndex: 1, fcpMs: 900, interactiveMs: 1800, distanceSquared: 0 },
        {
          runIndex: 2,
          fcpMs: 980,
          interactiveMs: 1950,
          distanceSquared: 28900,
        },
      ],
    };

    const lhr: RawLighthouseResult = {
      requestedUrl: "https://example.com",
      runWarnings: ["Page loaded slowly"],
      runtimeError: {
        code: "NO_ERROR",
        message: "",
      },
      categories: {
        performance: {
          id: "performance",
          score: 0.75,
          auditRefs: [
            { id: "render-blocking-insight", group: "insights", weight: 0 },
            { id: "cache-insight", group: "insights", weight: 0 },
            { id: "dom-size-insight", group: "insights", weight: 0 },
          ],
        },
        accessibility: {
          id: "accessibility",
          score: 0.85,
          auditRefs: [
            { id: "color-contrast", weight: 7 },
            { id: "image-alt", weight: 10 },
          ],
        },
      },
      audits: {
        "cache-insight": {
          id: "cache-insight",
          title: "Use efficient cache lifetimes",
          description: "A long cache lifetime can speed up repeat visits.",
          score: 0,
          scoreDisplayMode: "metricSavings",
          displayValue: "Est savings of 40 KB",
          metricSavings: { LCP: 150, FCP: 50 },
          replacesAudits: ["uses-long-cache-ttl"],
        },
        "render-blocking-insight": {
          id: "render-blocking-insight",
          title: "Render blocking requests",
          description: "Requests are blocking the page's initial render.",
          score: 0,
          scoreDisplayMode: "metricSavings",
          displayValue: "Est savings of 420 ms",
          metricSavings: { LCP: 420, FCP: 420 },
          replacesAudits: ["render-blocking-resources"],
        },
        "dom-size-insight": {
          id: "dom-size-insight",
          title: "Optimize DOM size",
          description: "A large DOM will increase memory usage.",
          score: 1,
          scoreDisplayMode: "numeric",
        },
        "viewport-insight": {
          id: "viewport-insight",
          title: "Optimize viewport for mobile",
          description: "Viewport delay.",
          score: 1,
          scoreDisplayMode: "numeric",
        },
        "unused-insight": {
          id: "unused-insight",
          title: "Not applicable insight",
          description: "Skipped",
          score: null,
          scoreDisplayMode: "notApplicable",
        },
        "color-contrast": {
          id: "color-contrast",
          title:
            "Background and foreground colors do not have a sufficient contrast ratio.",
          description: "Low-contrast text is difficult to read.",
          score: 0,
          scoreDisplayMode: "binary",
        },
        "image-alt": {
          id: "image-alt",
          title: "Image elements have [alt] attributes",
          description:
            "Informative elements should aim for short, descriptive alternate text.",
          score: 1,
          scoreDisplayMode: "binary",
        },
      },
    };

    const { summary } = normalizeLhr(lhr, medianMetadata);
    expect(summary.insights.map((i) => i.id)).toEqual([
      "render-blocking-insight",
      "cache-insight",
      "dom-size-insight",
      "viewport-insight",
    ]);
    expect(summary.failedAudits).toEqual([
      {
        id: "color-contrast",
        title:
          "Background and foreground colors do not have a sufficient contrast ratio.",
        description: "Low-contrast text is difficult to read.",
        category: "accessibility",
        score: 0,
        scoreDisplayMode: "binary",
        displayValue: null,
      },
    ]);
    expect(summary.runWarnings).toEqual(["Page loaded slowly"]);
    expect(summary.runtimeError).toBeNull();
    expect(summary.medianMetadata).toEqual(medianMetadata);

    const lhrWithRealError: RawLighthouseResult = {
      runtimeError: {
        code: "DNS_FAILURE",
        message: "DNS lookup failed",
      },
    };
    expect(normalizeLhr(lhrWithRealError).summary.runtimeError).toEqual({
      code: "DNS_FAILURE",
      message: "DNS lookup failed",
    });
  });
});
