import { describe, expect, it } from "bun:test";
import { API_ERROR_CODES } from "@devtools/core";
import { InvalidAuditOptionsError } from "@devtools/lighthouse";
import {
  handleWorkerAuditMessage,
  serializeAuditError,
  type WorkerOutboundMessage,
} from "../src/lighthouse/worker-handler";
import {
  AuditWorkerError,
  createWorkerAuditRunner,
  resolveLighthouseWorkerUrl,
  type WorkerLike,
} from "../src/lighthouse/worker-runner";

describe("Lighthouse API Worker Unit Seams", () => {
  describe("serializeAuditError", () => {
    it("preserves domain error codes and falls back to INTERNAL_ERROR", () => {
      const domainErr = new InvalidAuditOptionsError("Invalid URL");
      expect(serializeAuditError(domainErr)).toEqual({
        code: "INVALID_AUDIT_OPTIONS",
        message: "Invalid URL",
      });

      const genericErr = new Error("Something crashed");
      expect(serializeAuditError(genericErr)).toEqual({
        code: API_ERROR_CODES.INTERNAL_ERROR,
        message: "Something crashed",
      });

      expect(serializeAuditError("plain failure")).toEqual({
        code: API_ERROR_CODES.INTERNAL_ERROR,
        message: "plain failure",
      });

      expect(serializeAuditError(new Error(""))).toEqual({
        code: API_ERROR_CODES.INTERNAL_ERROR,
        message: "Lighthouse audit execution failed",
      });

      const emptyCodeErr = Object.assign(new Error("Empty code err"), {
        code: "",
      });
      expect(serializeAuditError(emptyCodeErr)).toEqual({
        code: API_ERROR_CODES.INTERNAL_ERROR,
        message: "Empty code err",
      });

      const numericCodeErr = Object.assign(new Error("Numeric code err"), {
        code: 123,
      });
      expect(serializeAuditError(numericCodeErr)).toEqual({
        code: API_ERROR_CODES.INTERNAL_ERROR,
        message: "Numeric code err",
      });

      expect(serializeAuditError("")).toEqual({
        code: API_ERROR_CODES.INTERNAL_ERROR,
        message: "Lighthouse audit execution failed",
      });

      expect(serializeAuditError(null)).toEqual({
        code: API_ERROR_CODES.INTERNAL_ERROR,
        message: "Lighthouse audit execution failed",
      });
    });
  });

  describe("handleWorkerAuditMessage", () => {
    it("posts progress events and complete payload on successful batch execution", async () => {
      const posted: WorkerOutboundMessage[] = [];
      const mockBatch = {
        validatedUrl: "https://example.com/",
        formFactor: "mobile" as const,
        throttlingMethod: "simulate" as const,
        totalRuns: 1,
        normalized: {
          requestedUrl: "https://example.com/",
          finalUrl: "https://example.com/",
          scores: {
            performanceScore: 95,
            accessibilityScore: 100,
            bestPracticesScore: 90,
            seoScore: 98,
          },
          metrics: {
            lcpMs: 1100,
            cls: 0.01,
            tbtMs: 20,
            fcpMs: 700,
            siMs: 1000,
            ttfbMs: 50,
          },
          summary: {
            lcpElement: null,
            lcpPhases: null,
            clsCulprits: [],
            insights: [],
            failedAudits: [],
            runWarnings: [],
            runtimeError: null,
            medianMetadata: null,
          },
        },
        reportJson: "{}",
        reportHtml: "<html></html>",
        representativeRunIndex: 0,
        durationMs: 1500,
      };

      await handleWorkerAuditMessage(
        {
          type: "run",
          payload: {
            url: "https://example.com/",
            formFactor: "mobile",
            throttlingMethod: "simulate",
            runs: 1,
            categories: ["performance"],
          },
        },
        {
          emit: (msg) => posted.push(msg),
          executeBatch: async (opts) => {
            opts.onProgress?.({
              stage: "navigating",
              message: "Navigating",
              runIndex: 0,
              totalRuns: 1,
            });
            return mockBatch;
          },
        },
      );

      expect(posted).toHaveLength(2);
      expect(posted[0]).toEqual({
        type: "progress",
        event: {
          stage: "navigating",
          message: "Navigating",
          runIndex: 0,
          totalRuns: 1,
        },
      });
      expect(posted[1]).toEqual({
        type: "complete",
        result: mockBatch,
      });
    });

    it("posts structured error payload when executeBatch throws", async () => {
      const posted: WorkerOutboundMessage[] = [];
      await handleWorkerAuditMessage(
        {
          type: "run",
          payload: {
            url: "ftp://invalid",
            formFactor: "mobile",
            throttlingMethod: "simulate",
            runs: 1,
            categories: ["performance"],
          },
        },
        {
          emit: (msg) => posted.push(msg),
        },
      );

      expect(posted).toHaveLength(1);
      expect(posted[0]?.type).toBe("error");
      if (posted[0]?.type === "error") {
        expect(posted[0].error.code).toBe("INVALID_AUDIT_OPTIONS");
      }
    });
  });

  describe("worker.ts message listener registration", () => {
    it("wires self message event listener to handleWorkerAuditMessage", async () => {
      const origAddEventListener = globalThis.addEventListener;
      const origPostMessage = globalThis.postMessage;
      const listeners = new Map<string, (event: never) => void>();
      const posted: WorkerOutboundMessage[] = [];

      let resolvePosted!: () => void;
      const postedDone = new Promise<void>((resolve) => {
        resolvePosted = resolve;
      });

      globalThis.addEventListener = ((
        type: string,
        listener: (event: never) => void,
      ) => {
        listeners.set(type, listener);
      }) as typeof globalThis.addEventListener;
      globalThis.postMessage = ((msg: WorkerOutboundMessage) => {
        posted.push(msg);
        resolvePosted();
      }) as unknown as typeof globalThis.postMessage;

      try {
        await import("../src/lighthouse/worker");
        const messageListener = listeners.get("message") as
          ((event: MessageEvent) => void) | undefined;
        expect(messageListener).toBeDefined();

        messageListener?.(
          new MessageEvent("message", {
            data: {
              type: "run",
              payload: {
                url: "ftp://bad-protocol.example.com",
                formFactor: "mobile",
                throttlingMethod: "simulate",
                runs: 1,
                categories: ["performance"],
              },
            },
          }),
        );

        await postedDone;
        expect(posted).toHaveLength(1);
        expect(posted[0]?.type).toBe("error");
      } finally {
        globalThis.addEventListener = origAddEventListener;
        globalThis.postMessage = origPostMessage;
      }
    });
  });

  describe("createWorkerAuditRunner", () => {
    function createFakeWorker(): WorkerLike & {
      emitMessage: (data: WorkerOutboundMessage) => void;
      emitError: (message: string) => void;
      emitMessageError: () => void;
      terminated: boolean;
      postedMessages: unknown[];
    } {
      const listeners = new Map<string, Array<(event: never) => void>>();
      const fake = {
        terminated: false,
        postedMessages: [] as unknown[],
        addEventListener(type: string, listener: (event: never) => void) {
          const existing = listeners.get(type) ?? [];
          existing.push(listener);
          listeners.set(type, existing);
        },
        postMessage(message: unknown) {
          fake.postedMessages.push(message);
        },
        terminate() {
          fake.terminated = true;
        },
        emitMessage(data: WorkerOutboundMessage) {
          for (const fn of listeners.get("message") ?? []) {
            fn(new MessageEvent("message", { data }) as never);
          }
        },
        emitError(message: string) {
          for (const fn of listeners.get("error") ?? []) {
            fn({ message } as never);
          }
        },
        emitMessageError() {
          for (const fn of listeners.get("messageerror") ?? []) {
            fn(new MessageEvent("messageerror") as never);
          }
        },
      };
      return fake;
    }

    it("forwards progress messages and resolves with batch result while terminating worker", async () => {
      const fake = createFakeWorker();
      const runner = createWorkerAuditRunner({
        createWorker: () => fake,
      });
      const stages: string[] = [];

      const promise = runner({
        url: "https://example.com/",
        formFactor: "desktop",
        throttlingMethod: "provided",
        runs: 2,
        categories: ["performance", "seo"],
        chromePath: "/mock/chrome",
        disableSandbox: true,
        env: { CUSTOM_FLAG: "1" },
        onProgress: (ev) => stages.push(ev.stage),
      });

      expect(fake.postedMessages).toHaveLength(1);
      expect(fake.postedMessages[0]).toEqual({
        type: "run",
        payload: {
          url: "https://example.com/",
          formFactor: "desktop",
          throttlingMethod: "provided",
          runs: 2,
          categories: ["performance", "seo"],
          chromePath: "/mock/chrome",
          disableSandbox: true,
          env: { CUSTOM_FLAG: "1" },
        },
      });
      fake.emitMessage({
        type: "progress",
        event: { stage: "locating_browser", message: "Locating" },
      });

      const mockResult = {
        validatedUrl: "https://example.com/",
        formFactor: "mobile" as const,
        throttlingMethod: "simulate" as const,
        totalRuns: 1,
        normalized: {
          requestedUrl: "https://example.com/",
          finalUrl: "https://example.com/",
          scores: {
            performanceScore: 99,
            accessibilityScore: 100,
            bestPracticesScore: 100,
            seoScore: 100,
          },
          metrics: {
            lcpMs: 900,
            cls: 0,
            tbtMs: 0,
            fcpMs: 500,
            siMs: 800,
            ttfbMs: 30,
          },
          summary: {
            lcpElement: null,
            lcpPhases: null,
            clsCulprits: [],
            insights: [],
            failedAudits: [],
            runWarnings: [],
            runtimeError: null,
            medianMetadata: null,
          },
        },
        reportJson: "{}",
        reportHtml: "<html></html>",
        representativeRunIndex: 0,
        durationMs: 1000,
      };
      fake.emitMessage({ type: "complete", result: mockResult });

      const resolved = await promise;
      expect(stages).toEqual(["locating_browser"]);
      expect(resolved).toEqual(mockResult);
      expect(fake.terminated).toBe(true);
    });

    it("rejects with AuditWorkerError on worker error, onerror, and onmessageerror", async () => {
      const fakeErr = createFakeWorker();
      const runnerErr = createWorkerAuditRunner({
        createWorker: () => fakeErr,
      });
      const p1 = runnerErr({ url: "https://example.com/" });
      fakeErr.emitMessage({
        type: "error",
        error: { code: "BROWSER_NOT_FOUND", message: "Chrome missing" },
      });
      try {
        await p1;
        throw new Error("Expected rejection");
      } catch (err) {
        expect(err).toBeInstanceOf(AuditWorkerError);
        expect((err as AuditWorkerError).code).toBe("BROWSER_NOT_FOUND");
        expect((err as AuditWorkerError).message).toBe("Chrome missing");
      }
      expect(fakeErr.terminated).toBe(true);

      const fakeCrash = createFakeWorker();
      let terminateCount = 0;
      const origTerminate = fakeCrash.terminate;
      fakeCrash.terminate = () => {
        terminateCount += 1;
        origTerminate();
      };
      const runnerCrash = createWorkerAuditRunner({
        createWorker: () => fakeCrash,
      });
      const p2 = runnerCrash({ url: "https://example.com/" });
      fakeCrash.emitError("");
      fakeCrash.emitError("Second ignored error");
      try {
        await p2;
        throw new Error("Expected rejection");
      } catch (err) {
        expect(err).toBeInstanceOf(AuditWorkerError);
        expect((err as AuditWorkerError).code).toBe(
          API_ERROR_CODES.INTERNAL_ERROR,
        );
        expect((err as AuditWorkerError).message).toBe(
          "Lighthouse worker thread crashed",
        );
      }
      expect(fakeCrash.terminated).toBe(true);
      expect(terminateCount).toBe(1);

      const fakeMsgErr = createFakeWorker();
      const runnerMsgErr = createWorkerAuditRunner({
        createWorker: () => fakeMsgErr,
      });
      const p3 = runnerMsgErr({ url: "https://example.com/" });
      fakeMsgErr.emitMessageError();
      try {
        await p3;
        throw new Error("Expected rejection");
      } catch (err) {
        expect(err).toBeInstanceOf(AuditWorkerError);
        expect((err as AuditWorkerError).code).toBe(
          API_ERROR_CODES.INTERNAL_ERROR,
        );
        expect((err as AuditWorkerError).message).toMatch(
          /serialize|deserializ/i,
        );
      }
      expect(fakeMsgErr.terminated).toBe(true);
    });

    it("resolveLighthouseWorkerUrl handles both source execution and compiled $bunfs binaries", () => {
      expect(resolveLighthouseWorkerUrl("file:///$bunfs/root/devtools")).toBe(
        "/$bunfs/root/api/src/lighthouse/worker.js",
      );
      expect(resolveLighthouseWorkerUrl()).toEndWith("/worker.ts");
    });
  });
});
