import { describe, expect, test } from "bun:test";
import {
  findNextAvailablePort,
  isPortAvailable,
} from "../src/commands/web/port";

describe("Port Detection Utilities", () => {
  test("isPortAvailable returns true for ephemeral port 0", () => {
    expect(isPortAvailable(0)).toBe(true);
  });

  test("isPortAvailable returns false for invalid port numbers", () => {
    expect(isPortAvailable(-1)).toBe(false);
    expect(isPortAvailable(70000)).toBe(false);
  });

  test("isPortAvailable accurately detects open vs occupied ports", () => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        return new Response("ok");
      },
    });
    const occupiedPort = server.port ?? 0;

    expect(isPortAvailable(occupiedPort)).toBe(false);

    void server.stop(true);
    expect(isPortAvailable(occupiedPort)).toBe(true);
  });

  test("findNextAvailablePort finds the next available socket port skipping occupied ports", () => {
    // Bind two servers to simulate contiguous occupied ports
    const s1 = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        return new Response();
      },
    });
    const basePort = s1.port ?? 0;

    // Check if the next port is available, or occupy it too
    let s2: ReturnType<typeof Bun.serve> | null = null;
    const nextCandidate = basePort + 1;
    if (nextCandidate <= 65534) {
      try {
        s2 = Bun.serve({
          port: nextCandidate,
          hostname: "127.0.0.1",
          fetch() {
            return new Response();
          },
        });
      } catch {
        // next candidate was occupied or restricted
      }
    }

    try {
      const foundPort = findNextAvailablePort(basePort, "127.0.0.1", 10);
      expect(foundPort).not.toBeNull();
      if (s2?.port !== undefined) {
        expect(foundPort!).toBeGreaterThan(s2.port);
      } else {
        expect(foundPort!).toBeGreaterThan(basePort);
      }
      expect(isPortAvailable(foundPort!)).toBe(true);
    } finally {
      void s1.stop(true);
      void s2?.stop(true);
    }
  });

  test("findNextAvailablePort returns null for boundary ports", () => {
    expect(findNextAvailablePort(65535)).toBeNull();
    expect(findNextAvailablePort(-5)).toBeNull();
    expect(findNextAvailablePort(0)).toBeNull();
  });

  test("findNextAvailablePort returns null when every port in search range is occupied", () => {
    const servers: ReturnType<typeof Bun.serve>[] = [];
    try {
      let portA = 0;
      let portB = 0;
      for (let attempt = 0; attempt < 20; attempt++) {
        const s1 = Bun.serve({
          port: 0,
          hostname: "127.0.0.1",
          routes: { "/": new Response("busy1") },
        });
        const candidateNext = (s1.port ?? 0) + 1;
        try {
          const s2 = Bun.serve({
            port: candidateNext,
            hostname: "127.0.0.1",
            routes: { "/": new Response("busy2") },
          });
          servers.push(s1, s2);
          portA = s1.port!;
          portB = s2.port!;
          break;
        } catch {
          void s1.stop(true);
        }
      }
      expect(portB).toBe(portA + 1);
      expect(findNextAvailablePort(portA, "127.0.0.1", 1)).toBeNull();
    } finally {
      for (const s of servers) {
        void s.stop(true);
      }
    }
  });

  test("findNextAvailablePort supports default hostname and maxAttempts arguments", () => {
    const available = findNextAvailablePort(59000);
    expect(available).not.toBeNull();
    expect(available!).toBeGreaterThan(59000);
    expect(available!).toBeLessThanOrEqual(59100);
  });
});
