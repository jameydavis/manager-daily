import { describe, it, expect, vi, afterEach } from "vitest";

describe("getJiraBoardIdFromEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns null when unset or empty", async () => {
    vi.stubEnv("JIRA_BOARD_ID", "");
    vi.resetModules();
    const { getJiraBoardIdFromEnv } = await import("./boardSprint.js");
    expect(getJiraBoardIdFromEnv()).toBeNull();
  });

  it("returns integer board id", async () => {
    vi.stubEnv("JIRA_BOARD_ID", "1577");
    vi.resetModules();
    const { getJiraBoardIdFromEnv } = await import("./boardSprint.js");
    expect(getJiraBoardIdFromEnv()).toBe(1577);
  });

  it("truncates and rejects non-positive", async () => {
    vi.stubEnv("JIRA_BOARD_ID", "42.9");
    vi.resetModules();
    const { getJiraBoardIdFromEnv } = await import("./boardSprint.js");
    expect(getJiraBoardIdFromEnv()).toBe(42);

    vi.stubEnv("JIRA_BOARD_ID", "0");
    vi.resetModules();
    const m2 = await import("./boardSprint.js");
    expect(m2.getJiraBoardIdFromEnv()).toBeNull();

    vi.stubEnv("JIRA_BOARD_ID", "nope");
    vi.resetModules();
    const m3 = await import("./boardSprint.js");
    expect(m3.getJiraBoardIdFromEnv()).toBeNull();
  });
});
