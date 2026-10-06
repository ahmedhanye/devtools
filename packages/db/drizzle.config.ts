import { defineConfig } from "drizzle-kit";
import { resolveDatabasePath } from "./src/config";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: resolveDatabasePath(),
  },
  strict: true,
  verbose: true,
});
