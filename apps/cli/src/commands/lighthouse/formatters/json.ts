/**
 * Formats data into a formatted JSON string for standard output.
 *
 * @param data - Any serializable data payload.
 * @returns 2-space indented JSON string.
 */
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
