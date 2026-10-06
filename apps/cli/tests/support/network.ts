/**
 * Shared network testing helpers for CLI integration and end-to-end tests.
 */

export function getFreePort(): number {
  const temp = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch() {
      return new Response();
    },
  });
  const port = temp.port ?? 0;
  temp.stop(true);
  if (port === 0) {
    throw new Error("Failed to allocate ephemeral port");
  }
  return port;
}

export const getEphemeralPort = getFreePort;

export async function waitForServer(
  port: number,
  host = "127.0.0.1",
  maxRetries = 50,
  intervalMs = 50,
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`http://${host}:${port}/api/health`);
      if (res.status === 200) {
        return true;
      }
    } catch {
      await Bun.sleep(intervalMs);
    }
  }
  return false;
}
