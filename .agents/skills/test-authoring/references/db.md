# Database package testing

Testing contracts and patterns for `packages/db` (`@devtools/db`).

- **Runner**: `bun:test`
- **Scope**: SQLite connections, Drizzle ORM schema, migrations, WAL mode.

## Patterns

1. **In-memory database isolation**: Use `:memory:` database instances for isolated, rapid unit tests.
2. **Migration execution**: Execute `runMigrations()` on clean databases to verify Drizzle migrations apply without schema errors.
3. **Table constraints**: Verify database-level constraints (foreign keys, unique indices, not-null constraints) reject invalid inserts.
4. **Migration idempotency**: Run `runMigrations()` repeatedly on the same database instance to verify migrations do not fail or duplicate tables.

## Example

```ts
import { describe, expect, it } from "bun:test";
import { createDatabase, runMigrations } from "../src";

describe("Database migrations and schema", () => {
  it("runs migrations idempotently on a fresh in-memory database", async () => {
    const db = createDatabase({ url: ":memory:" });

    await runMigrations(db);
    // Running a second time verifies idempotency
    await expect(runMigrations(db)).resolves.toBeUndefined();
  });

  it("enforces unique constraint on system registration", async () => {
    const db = createDatabase({ url: ":memory:" });
    await runMigrations(db);

    const record = { id: "daemon-primary", name: "daemon" };
    await db.insertRecord(record);

    // Duplicate key must reject
    await expect(db.insertRecord(record)).rejects.toThrow();
  });
});
```
