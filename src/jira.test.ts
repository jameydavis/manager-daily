import { describe, it, expect, vi, afterEach } from "vitest";

describe("getJiraEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns null when credentials incomplete", async () => {
    vi.stubEnv("ATLASSIAN_SITE", "https://x.atlassian.net");
    vi.stubEnv("ATLASSIAN_EMAIL", "");
    vi.stubEnv("ATLASSIAN_API_TOKEN", "tok");
    vi.resetModules();
    const { getJiraEnv } = await import("./jira.js");
    expect(getJiraEnv()).toBeNull();
  });

  it("returns env with trimmed site and default JQL", async () => {
    vi.stubEnv("ATLASSIAN_SITE", "https://x.atlassian.net/");
    vi.stubEnv("ATLASSIAN_EMAIL", "a@b.co");
    vi.stubEnv("ATLASSIAN_API_TOKEN", "secret");
    vi.resetModules();
    const { getJiraEnv } = await import("./jira.js");
    const env = getJiraEnv();
    expect(env).not.toBeNull();
    expect(env!.site).toBe("https://x.atlassian.net");
    expect(env!.email).toBe("a@b.co");
    expect(env!.token).toBe("secret");
    expect(env!.jql).toContain("assignee = currentUser()");
  });

  it("uses JIRA_JQL when set", async () => {
    vi.stubEnv("ATLASSIAN_SITE", "https://x.atlassian.net");
    vi.stubEnv("ATLASSIAN_EMAIL", "a@b.co");
    vi.stubEnv("ATLASSIAN_API_TOKEN", "secret");
    vi.stubEnv("JIRA_JQL", "project = FOO");
    vi.resetModules();
    const { getJiraEnv } = await import("./jira.js");
    expect(getJiraEnv()!.jql).toBe("project = FOO");
  });
});
