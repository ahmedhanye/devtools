import { readFileSync } from "node:fs";

/**
 * Strict sandbox Content-Security-Policy header applied to served standalone Lighthouse HTML reports.
 */
const REPORT_CSP_HEADER =
  "sandbox allow-scripts allow-popups allow-downloads; frame-ancestors 'self'";

/**
 * Reads a symlink-confined Lighthouse HTML report file from disk and returns a hardened HTTP response.
 */
export function createHtmlReportResponse(safePath: string): Response {
  // fallow-ignore-next-line security-sink -- safePath is symlink-confined inside artifactsDir by resolveSafeHtmlReportPath
  const html = readFileSync(safePath, "utf-8");
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": REPORT_CSP_HEADER,
      "Cache-Control": "private, no-store",
    },
  });
}
