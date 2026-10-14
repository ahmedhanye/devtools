# Core package testing

Testing contracts and patterns for `packages/core` (`@devtools/core`).

- **Runner**: `bun:test`
- **Scope**: Domain models, Zod schemas, configuration defaults, shared constants.

## Patterns

1. **Parse validation against fixture data**: Parse valid input objects through Zod schemas and verify the resulting typed structure.
2. **Default resolution**: Parse empty or partial input to verify schemas apply intended default values.
3. **Boundary values**: Verify numeric ranges (such as port 0 and 65535) and string bounds.
4. **Rejection of invalid types**: Verify malformed inputs throw `ZodError` with specific issues.
5. **Strictness enforcement**: Verify schemas using `.strict()` throw validation errors when unexpected keys are supplied.

## Example

```ts
import { describe, expect, it } from "bun:test";
import { DaemonConfigSchema } from "../src/config";

describe("DaemonConfigSchema", () => {
  it("resolves default port and host when omitted", () => {
    const parsed = DaemonConfigSchema.parse({});
    expect(parsed.port).toBe(4318);
    expect(parsed.host).toBe("127.0.0.1");
  });

  it("rejects out-of-range ports", () => {
    expect(() => DaemonConfigSchema.parse({ port: 70000 })).toThrow();
    expect(() => DaemonConfigSchema.parse({ port: -1 })).toThrow();
  });

  it("rejects unrecognized keys under strict mode", () => {
    expect(() =>
      DaemonConfigSchema.parse({
        port: 4318,
        unknownField: "malicious",
      }),
    ).toThrow();
  });
});
```
