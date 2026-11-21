import { defineConfig } from "drizzle-kit";
import { resolveDatabaseTargetPath } from "./src/config";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: resolveDatabaseTargetPath(),
  },
  strict: true,
  verbose: true,
});
