import { APP_VERSION } from "@devtools/core";
import { Command } from "commander";
import { registerBrowserCommands } from "../commands/browser";
import { registerLighthouseCommands } from "../commands/lighthouse";
import { registerWebCommand } from "../commands/web";

/**
 * Constructs the root Commander CLI program with `web`, `browser`, and `lighthouse` command hierarchies.
 *
 * @returns Configured Commander `Command` instance.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name("devtools")
    .description("DevTools Developer CLI")
    .version(APP_VERSION);

  registerWebCommand(program);
  registerBrowserCommands(program);
  registerLighthouseCommands(program);

  return program;
}
