/**
 * Probes whether a TCP port is currently available for binding on the specified hostname.
 *
 * @remarks
 * Port `0` (ephemeral OS-assigned port) is always treated as available.
 * Ports outside the valid `1–65535` range return `false`.
 *
 * @param port - TCP port number to probe.
 * @param hostname - Interface hostname or IP address to test binding against. Defaults to `"127.0.0.1"`.
 * @returns `true` if a temporary socket can bind to `hostname:port`, `false` otherwise.
 */
export function isPortAvailable(
  port: number,
  hostname: string = "127.0.0.1",
): boolean {
  if (port === 0) {
    return true;
  }
  if (port < 1 || port > 65535) {
    return false;
  }
  try {
    const server = Bun.serve({
      port,
      hostname,
      fetch() {
        return new Response();
      },
    });
    server.stop(true);
    return true;
  } catch {
    return false;
  }
}

/**
 * Scans sequentially upward from `startPort + 1` to locate the next available TCP port.
 *
 * @param startPort - Occupied port number from which the upward scan begins.
 * @param hostname - Interface hostname or IP address to test binding against. Defaults to `"127.0.0.1"`.
 * @param maxAttempts - Maximum number of sequential ports to probe. Defaults to `100`.
 * @returns First available TCP port number, or `null` if none is found within range.
 */
export function findNextAvailablePort(
  startPort: number,
  hostname: string = "127.0.0.1",
  maxAttempts: number = 100,
): number | null {
  if (startPort < 1 || startPort >= 65535) {
    return null;
  }
  const maxPort = Math.min(startPort + maxAttempts, 65535);
  for (let candidate = startPort + 1; candidate <= maxPort; candidate++) {
    if (isPortAvailable(candidate, hostname)) {
      return candidate;
    }
  }
  return null;
}
