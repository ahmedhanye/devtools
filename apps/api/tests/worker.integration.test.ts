import { describe, expect, it } from "bun:test";
import type { LighthouseProgressEvent } from "@devtools/lighthouse";
import {
  AuditWorkerError,
  runAuditInWorker,
} from "../src/lighthouse/worker-runner";

describe("Lighthouse API Real Bun Worker Integration", () => {
  it("spawns the Bun Worker thread and propagates structured validation errors back to parent", async () => {
    let caught: unknown;
    try {
      await runAuditInWorker({
        url: "ftp://not-http.example.com",
        formFactor: "mobile",
        throttlingMethod: "simulate",
        runs: 1,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AuditWorkerError);
    expect((caught as AuditWorkerError).code).toBe("INVALID_AUDIT_OPTIONS");
    expect((caught as AuditWorkerError).message).toMatch(
      /only http: and https:/i,
    );
  });

  it("streams real Worker progress IPC events before propagating INVALID_BROWSER_PATH", async () => {
    const events: LighthouseProgressEvent[] = [];
    let caught: unknown;
    try {
      await runAuditInWorker({
        url: "https://example.com/",
        formFactor: "mobile",
        throttlingMethod: "simulate",
        runs: 1,
        chromePath: "/nonexistent/devtools-missing-chrome",
        onProgress: (ev) => events.push(ev),
      });
    } catch (err) {
      caught = err;
    }

    expect(events.some((e) => e.stage === "locating_browser")).toBe(true);
    expect(caught).toBeInstanceOf(AuditWorkerError);
    expect((caught as AuditWorkerError).code).toBe("INVALID_BROWSER_PATH");
  });
});
