import fsd from "@feature-sliced/steiger-plugin";
import { defineConfig } from "steiger";

export default defineConfig([
  ...fsd.configs.recommended,
  {
    rules: {
      "fsd/no-higher-level-imports": "error",
      "fsd/no-cross-imports": "error",
      "fsd/no-wildcard-exports": "error",
    },
  },
  {
    files: ["./src/app/**"],
    rules: {
      "fsd/segments-by-purpose": "off",
    },
  },
]);
