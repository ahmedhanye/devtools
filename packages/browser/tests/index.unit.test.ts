import { describe, expect, test } from "bun:test";
import * as browser from "../src/index";

describe("@devtools/browser exports", () => {
  test("exports public browser contracts, functions, and error classes", () => {
    expect(typeof browser.resolveBrowserPath).toBe("function");
    expect(typeof browser.getBrowserStatus).toBe("function");
    expect(typeof browser.installBrowser).toBe("function");

    expect(browser.BrowserNotFoundError).toBeDefined();
    expect(browser.InvalidBrowserPathError).toBeDefined();
  });

  test("error classes instantiate with code and exitCode 1", () => {
    const notFound = new browser.BrowserNotFoundError();
    expect(notFound.exitCode).toBe(1);
    expect(notFound.code).toBe("BROWSER_NOT_FOUND");
    expect(notFound.message).toBe(browser.DEFAULT_BROWSER_NOT_FOUND_MESSAGE);

    const invalidPath = new browser.InvalidBrowserPathError(
      "/bad/path",
      "not executable",
    );
    expect(invalidPath.exitCode).toBe(1);
    expect(invalidPath.code).toBe("INVALID_BROWSER_PATH");
    expect(invalidPath.message).toContain("/bad/path");
  });
});
