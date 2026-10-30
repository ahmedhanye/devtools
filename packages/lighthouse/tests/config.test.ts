import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  findWorkspaceRoot,
  resolveArtifactsDir,
  resolveChromeSandboxDisabled,
} from "../src/config";

describe("resolveArtifactsDir (4-tier precedence waterfall)", () => {
  const tempRoot = join(tmpdir(), `devtools-lh-config-${Date.now()}`);

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("Tier 1: respects explicit customDir string or options.customDir override", () => {
    const explicitPath = join(tempRoot, "custom-string");
    const resolvedFromString = resolveArtifactsDir(explicitPath, {
      NODE_ENV: "production",
    });
    expect(resolvedFromString).toBe(explicitPath);
    expect(existsSync(explicitPath)).toBe(true);

    const explicitOptsPath = join(tempRoot, "custom-options");
    const resolvedFromOptions = resolveArtifactsDir({
      customDir: explicitOptsPath,
      env: { NODE_ENV: "test" },
    });
    expect(resolvedFromOptions).toBe(explicitOptsPath);
    expect(existsSync(explicitOptsPath)).toBe(true);
  });

  it("Tier 1: respects DEVTOOLS_LIGHTHOUSE_ARTIFACTS_DIR environment variable", () => {
    const envDir = join(tempRoot, "env-override");
    const resolved = resolveArtifactsDir({
      env: {
        DEVTOOLS_LIGHTHOUSE_ARTIFACTS_DIR: `  ${envDir}  `,
        NODE_ENV: "test",
      },
    });
    expect(resolved).toBe(envDir);
    expect(existsSync(envDir)).toBe(true);
  });

  it("Tier 1: resolves relative customDir against injected cwd seam", () => {
    const customCwd = join(tempRoot, "cwd-base");
    mkdirSync(customCwd, { recursive: true });

    const resolved = resolveArtifactsDir({
      customDir: "my-artifacts/lh",
      cwd: () => customCwd,
      env: { NODE_ENV: "test" },
    });
    expect(resolved).toBe(join(customCwd, "my-artifacts", "lh"));
    expect(existsSync(resolved)).toBe(true);
  });

  it("Tier 2: resolves to <tmpdir>/devtools-tests/lighthouse in test environment", () => {
    const resolvedNodeTest = resolveArtifactsDir({
      env: { NODE_ENV: "test" },
    });
    expect(resolvedNodeTest).toBe(
      join(tmpdir(), "devtools-tests", "lighthouse"),
    );
    expect(existsSync(resolvedNodeTest)).toBe(true);

    const resolvedBunTest = resolveArtifactsDir({
      env: { NODE_ENV: "development", BUN_ENV: "test" },
    });
    expect(resolvedBunTest).toBe(
      join(tmpdir(), "devtools-tests", "lighthouse"),
    );
  });

  it("Tier 3: resolves to <workspace_root>/.devtools/artifacts/lighthouse in local development", () => {
    const repoRoot = resolve(import.meta.dir, "../../..");
    const resolved = resolveArtifactsDir({
      env: { NODE_ENV: "development" },
      cwd: () => import.meta.dir,
    });
    expect(resolved).toBe(
      join(repoRoot, ".devtools", "artifacts", "lighthouse"),
    );
    expect(existsSync(resolved)).toBe(true);
  });

  it("Tier 3: falls back to cwd when findWorkspaceRoot returns null outside a workspace", () => {
    const isolatedDir = join(tmpdir(), `devtools-lh-isolated-${Date.now()}`);
    mkdirSync(isolatedDir, { recursive: true });
    writeFileSync(join(isolatedDir, "package.json"), "{ malformed json");
    try {
      expect(findWorkspaceRoot(isolatedDir)).toBeNull();
      const resolved = resolveArtifactsDir({
        env: { NODE_ENV: "development" },
        cwd: () => isolatedDir,
      });
      expect(resolved).toBe(
        join(isolatedDir, ".devtools", "artifacts", "lighthouse"),
      );
    } finally {
      rmSync(isolatedDir, { recursive: true, force: true });
    }
  });

  it("Tier 4: resolves to ~/.devtools/artifacts/lighthouse in production", () => {
    const resolved = resolveArtifactsDir({
      env: { NODE_ENV: "production" },
    });
    expect(resolved).toBe(
      join(homedir(), ".devtools", "artifacts", "lighthouse"),
    );
  });

  it("defaults to process.env and process.cwd when invoked with no arguments", () => {
    const resolved = resolveArtifactsDir();
    expect(typeof resolved).toBe("string");
    expect(resolved.length).toBeGreaterThan(0);
  });
});

describe("resolveChromeSandboxDisabled (Chromium sandbox policy seam)", () => {
  it("respects explicit disableSandbox boolean overrides", () => {
    expect(resolveChromeSandboxDisabled({ disableSandbox: true })).toBe(true);
    expect(
      resolveChromeSandboxDisabled({
        disableSandbox: false,
        env: { CI: "true", CHROME_NO_SANDBOX: "1" },
        getuid: () => 0,
      }),
    ).toBe(false);
  });

  it("disables sandbox when CHROME_NO_SANDBOX is configured", () => {
    expect(
      resolveChromeSandboxDisabled({
        env: { CHROME_NO_SANDBOX: "1" },
        getuid: () => 1000,
      }),
    ).toBe(true);
    expect(
      resolveChromeSandboxDisabled({
        env: { CHROME_NO_SANDBOX: "true" },
        getuid: () => 1000,
      }),
    ).toBe(true);
  });

  it("disables sandbox when running in CI environment", () => {
    expect(
      resolveChromeSandboxDisabled({
        env: { CI: "true" },
        getuid: () => 1000,
      }),
    ).toBe(true);
    expect(
      resolveChromeSandboxDisabled({
        env: { CI: "1" },
        getuid: () => 1000,
      }),
    ).toBe(true);
  });

  it("disables sandbox when running as root (uid 0)", () => {
    expect(
      resolveChromeSandboxDisabled({
        env: {},
        getuid: () => 0,
      }),
    ).toBe(true);
  });

  it("keeps sandboxing enabled in non-root desktop environments without CI or overrides", () => {
    expect(
      resolveChromeSandboxDisabled({
        env: {},
        getuid: () => 1000,
      }),
    ).toBe(false);
  });
});
