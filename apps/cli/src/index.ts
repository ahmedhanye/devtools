/**
 * DevTools CLI command tree and loopback daemon runner.
 *
 * @packageDocumentation
 */
export { createProgram, runCli } from "./app";
export type { DaemonInstance, StartDaemonOptions } from "./commands/web";
// oxlint-disable-next-line no-restricted-imports -- Keep commands/web barrel DB-free for Q13 lazy startup while exposing startDaemon from package root.
export { startDaemon } from "./commands/web/daemon";
