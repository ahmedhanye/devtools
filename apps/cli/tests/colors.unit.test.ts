import { describe, expect, it } from "bun:test";
import { getColors, shouldEnableColor } from "../src/colors";

describe("colors", () => {
  describe("shouldEnableColor", () => {
    it("respects explicit colors override", () => {
      expect(shouldEnableColor({ colors: true, isTTY: false })).toBe(true);
      expect(shouldEnableColor({ colors: false, isTTY: true })).toBe(false);
    });

    it("disables color when NO_COLOR is set", () => {
      expect(
        shouldEnableColor({
          isTTY: true,
          env: { NO_COLOR: "1" },
        }),
      ).toBe(false);
    });

    it("enables color when FORCE_COLOR is set", () => {
      expect(
        shouldEnableColor({
          isTTY: false,
          env: { FORCE_COLOR: "1" },
        }),
      ).toBe(true);
    });

    it("disables color when FORCE_COLOR is 0", () => {
      expect(
        shouldEnableColor({
          isTTY: false,
          env: { FORCE_COLOR: "0" },
        }),
      ).toBe(false);
    });

    it("disables color in non-TTY environments even if CI is true", () => {
      expect(
        shouldEnableColor({
          isTTY: false,
          env: { CI: "true" },
        }),
      ).toBe(false);
    });

    it("enables color in TTY environments when TERM is not dumb", () => {
      expect(
        shouldEnableColor({
          isTTY: true,
          env: { TERM: "xterm-256color" },
        }),
      ).toBe(true);
    });

    it("disables color in TTY environments when TERM is dumb", () => {
      expect(
        shouldEnableColor({
          isTTY: true,
          env: { TERM: "dumb" },
        }),
      ).toBe(false);
    });
  });

  describe("getColors", () => {
    it("returns active color formatters when colors are enabled", () => {
      const c = getColors({ colors: true });
      expect(c.green("test")).toContain("\x1b[32m");
    });

    it("returns plain pass-through formatters when colors are disabled", () => {
      const c = getColors({ colors: false });
      expect(c.green("test")).toBe("test");
    });
  });
});
