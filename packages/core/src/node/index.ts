/**
 * Node/Bun host runtime utilities, workspace root discovery, and scoped LIFO teardown helpers.
 *
 * @packageDocumentation
 */
export { createTeardown, type CleanupStep, type Teardown } from "./shutdown";
export {
  attachHostSignals,
  createBufferOutput,
  createConsoleOutput,
  createMemorySignalSource,
  type AttachHostSignalsOptions,
  type BufferOutput,
  type ExitPort,
  type HostSignal,
  type MemorySignalSource,
  type OutputPort,
  type SignalSourcePort,
} from "./signals";
export { findWorkspaceRoot, isStandaloneRuntime } from "./workspace";
