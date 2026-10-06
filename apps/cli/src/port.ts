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
