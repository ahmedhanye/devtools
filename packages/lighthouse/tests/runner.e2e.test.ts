import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  closeDb,
  createDb,
  createSqliteConnection,
  runMigrations,
  type DevtoolsDb,
} from "@devtools/db";
import {
  getLighthouseRunById,
  listLighthouseRuns,
  runLighthouseAudit,
  type LighthouseProgressEvent,
} from "../src";

describe("Live Lighthouse Headless Chrome Navigation (E2E)", () => {
  let tempArtifactsDir: string;
  let testSqlite: ReturnType<typeof createSqliteConnection>;
  let testDb: DevtoolsDb;

  beforeEach(() => {
    tempArtifactsDir = join(
      tmpdir(),
      `devtools-lh-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempArtifactsDir, { recursive: true });

    testSqlite = createSqliteConnection({ path: ":memory:" });
    testDb = createDb({ connection: testSqlite });
    runMigrations(testDb);
  });

  afterEach(async () => {
    closeDb();
    testSqlite.close();
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

      const result = await runLighthouseAudit({
        url: fixtureUrl,
        formFactor: "desktop",
        throttlingMethod: "provided",
        runs: 1,
        artifactsDir: tempArtifactsDir,
        db: testDb,
        onProgress: (ev) => progressEvents.push(ev),
      });

      // Exactly 1 canonical row in lighthouse_runs
      const allRows = listLighthouseRuns(testDb);
      expect(allRows).toHaveLength(1);
      expect(result.run.id).toBe(allRows[0]!.id);
      expect(result.run.formFactor).toBe("desktop");
      expect(result.run.throttlingMethod).toBe("provided");
      expect(result.run.performanceScore).toBeGreaterThanOrEqual(0);
      expect(result.run.lcpMs).not.toBeNull();
      expect(result.run.fcpMs).not.toBeNull();

      // Exactly 1 pair of disk artifacts written for the run
      expect(existsSync(result.run.jsonReportPath)).toBe(true);
      expect(existsSync(result.run.htmlReportPath)).toBe(true);
      const rawHtml = readFileSync(result.run.htmlReportPath, "utf-8");
      expect(rawHtml).toContain("<!doctype html>");
      expect(rawHtml).toContain("</html>");

      // Verify lifecycle progress stages include navigating, analyzing, and complete
      expect(progressEvents.some((e) => e.stage === "navigating")).toBe(true);
      expect(progressEvents.some((e) => e.stage === "analyzing")).toBe(true);
      expect(progressEvents.at(-1)?.stage).toBe("complete");

      // Stored row is retrievable by ID
      const fetched = getLighthouseRunById(testDb, result.run.id);
      expect(fetched?.id).toBe(result.run.id);
    } finally {
      await server.stop(true);
    }
  }, 120000);
});
