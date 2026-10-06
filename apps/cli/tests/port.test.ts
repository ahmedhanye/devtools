import { describe, expect, test } from "bun:test";
import { findNextAvailablePort, isPortAvailable } from "../src/port";

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

    server.stop(true);
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
      s1.stop(true);
      s2?.stop(true);
    }
  });

  test("findNextAvailablePort returns null for boundary ports", () => {
    expect(findNextAvailablePort(65535)).toBeNull();
    expect(findNextAvailablePort(-5)).toBeNull();
  });
});
