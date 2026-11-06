import { describe, expect, test } from "bun:test";
import { Command } from "commander";
import { registerLighthouseCommands } from "../src/lighthouse/index";
import type {
  LighthouseAuditCommandOptions,
  LighthouseListCommandOptions,
} from "../src/lighthouse/types";

function setupCommandForTesting(program: Command): {
  getOutput: () => string;
} {
  let output = "";
  const write = (chunk: string) => {
    output += chunk;
  };

  const apply = (cmd: Command) => {
    cmd.exitOverride();
    cmd.configureOutput({
      writeOut: write,
      writeErr: write,
    });
    for (const sub of cmd.commands) {
      apply(sub);
    }
  };

  apply(program);
  return { getOutput: () => output };
}

describe("CLI Lighthouse Command Integration", () => {
  test("lighthouse --help outputs complete option and subcommand help", () => {
    const program = new Command();
    program.name("devtools");
    registerLighthouseCommands(program);
    const { getOutput } = setupCommandForTesting(program);

    try {
      program.parse(["lighthouse", "--help"], { from: "user" });
    } catch {
      // Commander throws CommanderError on exitOverride()
    }

    const output = getOutput();
    expect(output).toContain("Usage: devtools lighthouse");
    expect(output).toContain("--agent");
    expect(output).toContain("--fail-under");
    expect(output).toContain("--runs");
    expect(output).toContain("list");
    expect(output).toContain("diff");
    expect(output).toContain("open");
  });

  test("lighthouse list --help outputs list command options", () => {
    const program = new Command();
    program.name("devtools");
    registerLighthouseCommands(program);
    const { getOutput } = setupCommandForTesting(program);

    try {
      program.parse(["lighthouse", "list", "--help"], { from: "user" });
    } catch {
      // Commander throws on exitOverride()
    }

    const output = getOutput();
    expect(output).toContain("Usage: devtools lighthouse list");
    expect(output).toContain("--url");
    expect(output).toContain("--form-factor");
    expect(output).toContain("--limit");
    expect(output).toContain("--json");
  });

  test("lighthouse diff --help outputs diff command options and arguments", () => {
    const program = new Command();
    program.name("devtools");
    registerLighthouseCommands(program);
    const { getOutput } = setupCommandForTesting(program);

    try {
      program.parse(["lighthouse", "diff", "--help"], { from: "user" });
    } catch {
      // Commander throws on exitOverride()
    }

    const output = getOutput();
    expect(output).toContain(
      "Usage: devtools lighthouse diff [options] <id1> <id2>",
    );
    expect(output).toContain("--json");
  });

  test("lighthouse open --help outputs open command options and arguments", () => {
    const program = new Command();
    program.name("devtools");
    registerLighthouseCommands(program);
    const { getOutput } = setupCommandForTesting(program);

    try {
      program.parse(["lighthouse", "open", "--help"], { from: "user" });
    } catch {
      // Commander throws on exitOverride()
    }

    const output = getOutput();
    expect(output).toContain("Usage: devtools lighthouse open [options] [id]");
  });

  test("invoking devtools lighthouse with no arguments displays help output", async () => {
    const program = new Command();
    program.name("devtools");
    let helpCalled = false;
    const lhCmd = registerLighthouseCommands(program);
    lhCmd.outputHelp = () => {
      helpCalled = true;
    };

    await program.parseAsync(["lighthouse"], { from: "user" });
    expect(helpCalled).toBe(true);
  });

  test("dispatches lighthouse <url> with custom options and rule collector", async () => {
    let capturedUrl: string | undefined;
    let capturedOpts: LighthouseAuditCommandOptions | undefined;

    const program = new Command();
    program.name("devtools");
    registerLighthouseCommands(program, {
      runAudit: async (url, opts) => {
        capturedUrl = url;
        capturedOpts = opts;
      },
    });

    await program.parseAsync(
      [
        "lighthouse",
        "https://example.com/",
        "--fail-under",
        "perf:90",
        "--fail-under",
        "lcp:2500",
        "-r",
        "3",
      ],
      { from: "user" },
    );

    expect(capturedUrl).toBe("https://example.com/");
    expect(capturedOpts?.runs).toBe(3);
    expect(capturedOpts?.failUnder).toEqual(["perf:90", "lcp:2500"]);
  });

  test("dispatches lighthouse list subcommand through action handler", async () => {
    let listCalled = false;
    let capturedOpts: LighthouseListCommandOptions | undefined;

    const program = new Command();
    program.name("devtools");
    registerLighthouseCommands(program, {
      runList: async (opts) => {
        listCalled = true;
        capturedOpts = opts;
      },
    });

    await program.parseAsync(["lighthouse", "list", "-l", "5", "--json"], {
      from: "user",
    });

    expect(listCalled).toBe(true);
    expect(capturedOpts?.limit).toBe(5);
    expect(capturedOpts?.json).toBe(true);
  });

  test("lighthouse list rejects negative or non-integer limit option via Commander parser", async () => {
    const program = new Command();
    program.name("devtools");
    registerLighthouseCommands(program, {
      runList: async () => {},
    });
    const { getOutput } = setupCommandForTesting(program);

    let errorThrown = false;
    try {
      await program.parseAsync(["lighthouse", "list", "-l", "-5"], {
        from: "user",
      });
    } catch {
      errorThrown = true;
    }

    expect(errorThrown).toBe(true);
    expect(getOutput()).toContain(
      'Invalid limit "-5": must be a non-negative integer',
    );
  });

  test("lighthouse list rejects invalid form-factor option via Commander choices", async () => {
    const program = new Command();
    program.name("devtools");
    registerLighthouseCommands(program, {
      runList: async () => {},
    });
    const { getOutput } = setupCommandForTesting(program);

    let errorThrown = false;
    try {
      await program.parseAsync(["lighthouse", "list", "-m", "tablet"], {
        from: "user",
      });
    } catch {
      errorThrown = true;
    }

    expect(errorThrown).toBe(true);
    expect(getOutput()).toContain("argument 'tablet' is invalid");
  });

  test("dispatches lighthouse diff subcommand through action handler", async () => {
    let diffCalled = false;
    let capturedId1: string | undefined;
    let capturedId2: string | undefined;

    const program = new Command();
    program.name("devtools");
    registerLighthouseCommands(program, {
      runDiff: async (id1, id2) => {
        diffCalled = true;
        capturedId1 = id1;
        capturedId2 = id2;
      },
    });

    await program.parseAsync(
      ["lighthouse", "diff", "run-111", "run-222", "--json"],
      { from: "user" },
    );

    expect(diffCalled).toBe(true);
    expect(capturedId1).toBe("run-111");
    expect(capturedId2).toBe("run-222");
  });

  test("dispatches lighthouse open subcommand through action handler", async () => {
    let openCalled = false;
    let capturedId: string | undefined;

    const program = new Command();
    program.name("devtools");
    registerLighthouseCommands(program, {
      runOpen: async (id) => {
        openCalled = true;
        capturedId = id;
      },
    });

    await program.parseAsync(["lighthouse", "open", "run-333"], {
      from: "user",
    });

    expect(openCalled).toBe(true);
    expect(capturedId).toBe("run-333");
  });
});
