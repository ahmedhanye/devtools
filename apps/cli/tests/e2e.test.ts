import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { ApiErrorResponseSchema, HealthResponseSchema } from "@devtools/core";
import { getEphemeralPort, waitForServer } from "./support/network";

const binPath = resolve(__dirname, "../bin/devtools.js");

describe("End-to-End Interconnected Stack Integration (CLI -> Daemon -> UI -> API -> Core)", () => {
  test("starts daemon via CLI, delivers static UI assets, routes API requests, and verifies contracts end-to-end", async () => {
    const port = getEphemeralPort();
    const daemonProc = Bun.spawn(
      ["bun", binPath, "web", "--port", String(port), "--host", "127.0.0.1"],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    try {
      const isUp = await waitForServer(port);
      expect(isUp).toBe(true);

      const baseUrl = `http://127.0.0.1:${port}`;

      // 1. Static Web UI Delivery: Root route serves index.html
      const indexRes = await fetch(`${baseUrl}/`);
      expect(indexRes.status).toBe(200);
      expect(indexRes.headers.get("content-type")).toContain("text/html");

      const indexHtml = await indexRes.text();
      expect(indexHtml).toContain("<!DOCTYPE html>");
      expect(indexHtml).toContain("DevTools System Dashboard");
      expect(indexHtml).toContain("DevTools API Service");
      expect(indexHtml).toContain("Shared Domain Core");
      expect(indexHtml).toContain("Loopback Daemon");
      expect(indexHtml).toContain("Web Application Shell");

      // 2. Static Asset Delivery: CSS and JS bundles linked in HTML are servable
      const cssMatch = indexHtml.match(
        /href="(\/_next\/static\/chunks\/[^"]+\.css)"/,
      );
      if (cssMatch && cssMatch[1]) {
        const cssRes = await fetch(`${baseUrl}${cssMatch[1]}`);
        expect(cssRes.status).toBe(200);
        expect(cssRes.headers.get("content-type")).toContain("text/css");
      }

      const jsMatch = indexHtml.match(
        /src="(\/_next\/static\/chunks\/[^"]+\.js)"/,
      );
      if (jsMatch && jsMatch[1]) {
        const jsRes = await fetch(`${baseUrl}${jsMatch[1]}`);
        expect(jsRes.status).toBe(200);
        const jsContentType = jsRes.headers.get("content-type") ?? "";
        expect(
          jsContentType.includes("javascript") ||
            jsContentType.includes("application/octet-stream") ||
            jsContentType.includes("text/plain"),
        ).toBe(true);
      }

      // 3. Static 404 Routing
      const static404Res = await fetch(`${baseUrl}/nonexistent-page-route`);
      expect(static404Res.status).toBe(404);
      expect(static404Res.headers.get("content-type")).toContain("text/html");
      const static404Html = await static404Res.text();
      expect(static404Html).toContain("404");

      // 4. In-Process API Route: /api/health returns contract-validated payload
      const healthRes = await fetch(`${baseUrl}/api/health`);
      expect(healthRes.status).toBe(200);
      expect(healthRes.headers.get("content-type")).toContain(
        "application/json",
      );

      const healthPayload = await healthRes.json();
      const validatedHealth = HealthResponseSchema.parse(healthPayload);
      expect(validatedHealth.status).toBe("ok");
      expect(validatedHealth.version).toBe("0.1.0");
      expect(validatedHealth.uptime).toBeGreaterThanOrEqual(0);
      expect(new Date(validatedHealth.timestamp).getTime()).not.toBeNaN();

      // 5. In-Process API Error Route: /api/* 404 returns contract-validated error response
      const api404Res = await fetch(`${baseUrl}/api/nonexistent-endpoint`);
      expect(api404Res.status).toBe(404);
      expect(api404Res.headers.get("content-type")).toContain(
        "application/json",
      );

      const api404Payload = await api404Res.json();
      const validatedError = ApiErrorResponseSchema.parse(api404Payload);
      expect(validatedError.error.code).toBe("NOT_FOUND");
      expect(validatedError.error.message).toContain("not found");

      // 6. Graceful Lifecycle Termination: Process exits with code 0 on SIGTERM
      daemonProc.kill("SIGTERM");
      const exitCode = await daemonProc.exited;
      expect(exitCode).toBe(0);

      const stdout = await new Response(daemonProc.stdout).text();
      expect(stdout).toContain(
        `DevTools daemon listening on http://127.0.0.1:${port}`,
      );
      expect(stdout).toContain("Received SIGTERM. Shutting down");

      // 7. Verify socket closed after termination
      expect(fetch(`${baseUrl}/api/health`)).rejects.toThrow();
    } finally {
      daemonProc.kill();
    }
  });
});
