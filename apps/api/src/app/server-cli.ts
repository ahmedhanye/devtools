import {
  runServerCli,
  type ServerCliDeps,
  type ServerInstance,
} from "./server";

/**
 * Starts the API server CLI when executed as the primary module entrypoint.
 */
export function executeServerMain(
  isMain: boolean,
  deps?: ServerCliDeps,
): ServerInstance | undefined {
  if (!isMain) {
    return undefined;
  }
  return runServerCli(deps);
}

executeServerMain(import.meta.main);
