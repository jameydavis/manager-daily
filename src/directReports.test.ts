import { describe, it, expect, vi, afterEach } from "vitest";

describe("parseDirectReportNamesFromEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns empty list when env unset", async () => {
    vi.stubEnv("JIRA_DIRECT_REPORTS", "");
    vi.resetModules();
    const { parseDirectReportNamesFromEnv } = await import("./directReports.js");
    expect(parseDirectReportNamesFromEnv()).toEqual([]);
  });

  it("splits comma and newline lists", async () => {
    vi.stubEnv("JIRA_DIRECT_REPORTS", "Alice, Bob\nCarol, ");
    vi.resetModules();
    const { parseDirectReportNamesFromEnv } = await import("./directReports.js");
    expect(parseDirectReportNamesFromEnv()).toEqual(["Alice", "Bob", "Carol"]);
  });
});
