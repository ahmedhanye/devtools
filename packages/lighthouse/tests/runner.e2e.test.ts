import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { openDb, type DbHandle } from "@devtools/db";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createLighthouseStore,
  type LighthouseProgressEvent,
  type LighthouseStore,
} from "../src";

describe("Live Lighthouse Headless Chrome Navigation (E2E)", () => {
  let tempArtifactsDir: string;
  let db: DbHandle;
  let store: LighthouseStore;

  beforeEach(() => {
    tempArtifactsDir = join(
      tmpdir(),
      `devtools-lh-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempArtifactsDir, { recursive: true });
    db = openDb({ memory: true });
    store = createLighthouseStore({
      db,
      artifactsDir: tempArtifactsDir,
    });
  });

  afterEach(() => {
    db.close();
    rmSync(tempArtifactsDir, { recursive: true, force: true });
  });

  it("executes a live headless Chromium navigation audit against a local HTTP fixture", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(
          "<!doctype html><html><head><title>Live Fixture</title></head><body><main><h1 class='hero'>Live Heading</h1><p>Body text</p></main></body></html>",
          { headers: { "content-type": "text/html" } },
        );
      },
    });

    try {
      const fixtureUrl = `http://127.0.0.1:${server.port}/`;
      const progressEvents: LighthouseProgressEvent[] = [];

      const result = await store.runAudit({
        url: fixtureUrl,
        formFactor: "desktop",
        throttlingMethod: "simulate",
        runs: 1,
        onProgress: (ev) => progressEvents.push(ev),
      });

      const allRows = store.listRuns();
      expect(allRows).toHaveLength(1);
      expect(result.run.id).toBe(allRows[0]!.id);
      expect(result.previousRun).toBeNull();
      expect(result.run.formFactor).toBe("desktop");
      expect(result.run.throttlingMethod).toBe("simulate");
      expect(result.run.performanceScore).toBeGreaterThanOrEqual(0);
      expect(result.run.lcpMs).not.toBeNull();
      expect(result.run.fcpMs).not.toBeNull();

      expect(existsSync(result.run.jsonReportPath)).toBe(true);
      expect(existsSync(result.run.htmlReportPath)).toBe(true);
      const rawHtml = readFileSync(result.run.htmlReportPath, "utf-8");
      expect(rawHtml).toContain("<!doctype html>");
      expect(rawHtml).toContain("</html>");

      expect(progressEvents.some((e) => e.stage === "navigating")).toBe(true);
      expect(progressEvents.some((e) => e.stage === "analyzing")).toBe(true);
      expect(progressEvents.at(-1)?.stage).toBe("complete");

      const fetched = store.getRun(result.run.id);
      expect(fetched.id).toBe(result.run.id);
    } finally {
      await server.stop(true);
    }
  }, 120000);
});
