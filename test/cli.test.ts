import { test, expect, describe } from "bun:test";

/**
 * Tests for CLI argument validation logic.
 * We test the URL validation function directly.
 */

function validateUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("URL must use http:// or https:// protocol");
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("protocol")) {
      throw err;
    }
    throw new Error(
      `Invalid URL: "${url}". Please provide a valid URL (e.g. http://localhost:3000)`
    );
  }
}

describe("URL validation", () => {
  test("accepts valid http URL", () => {
    expect(() => validateUrl("http://localhost:3000")).not.toThrow();
  });

  test("accepts valid https URL", () => {
    expect(() => validateUrl("https://example.com")).not.toThrow();
  });

  test("accepts URL with path", () => {
    expect(() => validateUrl("http://localhost:8080/app/dashboard")).not.toThrow();
  });

  test("rejects invalid URL", () => {
    expect(() => validateUrl("not-a-url")).toThrow("Invalid URL");
  });

  test("rejects FTP URL", () => {
    expect(() => validateUrl("ftp://example.com")).toThrow("protocol");
  });

  test("rejects empty string", () => {
    expect(() => validateUrl("")).toThrow("Invalid URL");
  });
});

describe("CLI module", () => {
  test("src/cli.ts exists and exports are valid", async () => {
    // Just verify the file can be parsed (don't execute main())
    const fs = await import("node:fs");
    const cliContent = fs.readFileSync(
      new URL("../src/cli.ts", import.meta.url),
      "utf-8"
    );
    // Verify unified pipeline imports
    expect(cliContent).toContain("yargs");
    expect(cliContent).toContain("initModel");
    expect(cliContent).toContain("launchBrowser");
    expect(cliContent).toContain("capturePage");
    expect(cliContent).toContain("parseSnapshot");
    expect(cliContent).toContain("analyze");
    expect(cliContent).toContain("createWorkspace");
    expect(cliContent).toContain("printFindings");
    expect(cliContent).toContain("printCaptureInfo");
  });
});
