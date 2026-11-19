/**
 * Node/Bun host runtime utilities, workspace root discovery, and 3-phase shutdown coordination.
 *
 * @packageDocumentation
 */
export {
  SHUTDOWN_PHASES,
  createShutdownCoordinator,
  hostShutdown,
  type ShutdownCoordinator,
  type ShutdownRegistry,
} from "./shutdown";
export {
  attachHostSignals,
  createBufferOutput,
  createConsoleOutput,
  createMemorySignalSource,
  type ExitPort,
  type OutputPort,
  type SignalSourcePort,
} from "./signals";
export { findWorkspaceRoot, isStandaloneRuntime } from "./workspace";
