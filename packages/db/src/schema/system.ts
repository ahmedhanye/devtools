import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Core key-value metadata table storing system-level state and schema properties.
 */
export const systemMetadata = sqliteTable("system_metadata", {
  /** Unique metadata key identifier. */
  key: text("key").primaryKey(),
  /** Serialized metadata value string. */
  value: text("value").notNull(),
  /** Timestamp (in epoch milliseconds) when the entry was last updated. */
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
