import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn utility", () => {
  it("merges class names correctly", () => {
    expect(cn("bg-primary", "text-primary-foreground")).toBe(
      "bg-primary text-primary-foreground",
    );
  });

  it("handles conditional classes and falsy values", () => {
    const isHidden = false;
    expect(
      cn("flex", isHidden && "hidden", null, undefined, "items-center"),
    ).toBe("flex items-center");
  });

  it("resolves conflicting tailwind classes with twMerge", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
    expect(cn("bg-primary", "bg-destructive")).toBe("bg-destructive");
  });
});
