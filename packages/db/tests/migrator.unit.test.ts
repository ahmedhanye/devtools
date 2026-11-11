import { describe, expect, it } from "bun:test";
import { buildEmbeddedMigrations } from "../src/migrator";

describe("buildEmbeddedMigrations", () => {
  it("throws explicitly when a journal entry tag is missing from bundled SQL", () => {
    expect(() =>
      buildEmbeddedMigrations(
        [
          { tag: "0000_init", when: 1700000000000 },
          { tag: "9999_missing", when: 1700000001000 },
        ],
        {
          "0000_init": "CREATE TABLE `t` (`id` text PRIMARY KEY NOT NULL);",
        },
      ),
    ).toThrow("Missing embedded migration SQL for 9999_missing");

    expect(() =>
      buildEmbeddedMigrations([{ tag: "toString", when: 1700000002000 }], {}),
    ).toThrow("Missing embedded migration SQL for toString");
  });

  it("splits multi-statement SQL and preserves intentionally empty bundled SQL", () => {
    const migrations = buildEmbeddedMigrations(
      [
        { tag: "0000_multi", when: 1700000000000 },
        { tag: "0001_empty", when: 1700000001000 },
      ],
      {
        "0000_multi":
          "CREATE TABLE `a` (`id` text PRIMARY KEY);\n--> statement-breakpoint\nCREATE INDEX `a_idx` ON `a` (`id`);",
        "0001_empty": "",
      },
    );

    expect(migrations).toEqual([
      {
        statements: [
          "CREATE TABLE `a` (`id` text PRIMARY KEY);\n",
          "\nCREATE INDEX `a_idx` ON `a` (`id`);",
        ],
        folderMillis: 1700000000000,
        hash: "6d0d7ad4816d0f8a43a2b9228bb7914ad950dea87ba4e9b48e99854d2e9147f5",
      },
      {
        statements: [],
        folderMillis: 1700000001000,
        hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
    ]);
  });
});
