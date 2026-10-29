import { createRequire } from "node:module";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { loadCsf } from "storybook/internal/csf-tools";
import { defineConfig, type Plugin } from "vitest/config";

const require = createRequire(import.meta.url);

function generateStoryTestSuite(
  id: string,
  metaVar: string,
  storyExportNames: readonly string[],
  previewPath: string,
): string {
  const exportsMapping = storyExportNames
    .map((name) => `${name}: ${name}`)
    .join(",\n  ");
  const testsMapping = storyExportNames
    .map(
      (name) => `
  __sb_test("${name}", async () => {
    const story = __sb_composed[${JSON.stringify(name)}];
    if (story && typeof story.run === "function") {
      await story.run();
    }
  });`,
    )
    .join("\n");

  return `
// Injected by storybookStoriesPlugin for Vitest execution
import { describe as __sb_describe, test as __sb_test } from "vitest";
import { composeStories as __sb_composeStories } from "@storybook/nextjs-vite";
import * as __sb_previewModule from "${previewPath}";

const __sb_module = {
  default: ${metaVar},
  ${exportsMapping}
};

const __sb_composed = __sb_composeStories(__sb_module, __sb_previewModule.default);

__sb_describe("${path.basename(id)}", () => {
  ${testsMapping}
});
`;
}

function isStoryFile(id: string): boolean {
  return id.endsWith(".stories.tsx") || id.endsWith(".stories.ts");
}

function parseStoryExports(code: string): {
  readonly metaVar: string;
  readonly storyNames: readonly string[];
} {
  const csf = loadCsf(code, {
    makeTitle: (userTitle) => userTitle || "Story",
  }).parse();
  const metaVar = csf._metaVariableName;
  if (!metaVar) {
    throw new Error(
      "storybookStoriesPlugin: declare the default export as `const meta = {...}; export default meta;`.",
    );
  }
  return {
    metaVar,
    storyNames: Object.keys(csf._stories),
  };
}

function storybookStoriesPlugin(): Plugin {
  const previewPath = path
    .resolve(import.meta.dirname, "./.storybook/preview")
    .replaceAll("\\", "/");

  return {
    name: "vite-plugin-storybook-stories",
    enforce: "post",
    transform(code: string, id: string) {
      if (!isStoryFile(id)) {
        return null;
      }

      const { metaVar, storyNames } = parseStoryExports(code);
      if (storyNames.length === 0) {
        return null;
      }

      const testBlock = generateStoryTestSuite(
        id,
        metaVar,
        storyNames,
        previewPath,
      );

      return {
        code: `${code}\n${testBlock}`,
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), storybookStoriesPlugin()],
  test: {
    environment: "happy-dom",
    globals: true,
    server: {
      deps: {
        inline: [/@storybook/, /vite-plugin-storybook-nextjs/],
      },
    },
    include: ["src/**/*.{test,spec}.ts", "src/**/*.stories.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json", "json-summary"],
      reportsDirectory: "./coverage",
      reportOnFailure: true,
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.stories.{ts,tsx}",
        "src/app/**/*.next.{ts,tsx}",
        ".storybook/**",
        "**/dist/**",
        "**/.next/**",
        "steiger.config.js",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "next/navigation":
        require.resolve("vite-plugin-storybook-nextjs/browser/mocks/navigation"),
      "@storybook/nextjs-vite/navigation.mock":
        require.resolve("vite-plugin-storybook-nextjs/browser/mocks/navigation"),
      "next/link":
        require.resolve("vite-plugin-storybook-nextjs/browser/mocks/link"),
      "@storybook/nextjs-vite/link.mock":
        require.resolve("vite-plugin-storybook-nextjs/browser/mocks/link"),
      "next/headers":
        require.resolve("vite-plugin-storybook-nextjs/browser/mocks/headers"),
      "@storybook/nextjs-vite/headers.mock":
        require.resolve("vite-plugin-storybook-nextjs/browser/mocks/headers"),
      "next/router":
        require.resolve("vite-plugin-storybook-nextjs/browser/mocks/router"),
      "@storybook/nextjs-vite/router.mock":
        require.resolve("vite-plugin-storybook-nextjs/browser/mocks/router"),
      "next/cache":
        require.resolve("vite-plugin-storybook-nextjs/browser/mocks/cache"),
      "@storybook/nextjs-vite/cache.mock":
        require.resolve("vite-plugin-storybook-nextjs/browser/mocks/cache"),
      "sb-original/image-context":
        require.resolve("vite-plugin-storybook-nextjs/browser/mocks/image-context"),
      "sb-original/default-loader":
        require.resolve("vite-plugin-storybook-nextjs/browser/mocks/image-default-loader"),
    },
  },
});
