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

describe("encodeJiraIssueForModal", () => {
  it("round-trips issue payload for data attributes", async () => {
    const { encodeJiraIssueForModal } = await import("./jira.js");
    const payload = {
      key: "PROJ-1",
      summary: "Fix login",
      status: "In Progress",
      issueType: "Bug",
      browseUrl: "https://x.atlassian.net/browse/PROJ-1",
      timeLogged: "2h",
      assignee: "Pat",
    };
    const encoded = encodeJiraIssueForModal(payload);
    expect(JSON.parse(decodeURIComponent(encoded))).toEqual(payload);
  });
});

describe("adfToPlainText", () => {
  it("returns empty for null and legacy empty", async () => {
    const { adfToPlainText } = await import("./jira.js");
    expect(adfToPlainText(null)).toBe("");
    expect(adfToPlainText(undefined)).toBe("");
    expect(adfToPlainText("")).toBe("");
  });

  it("returns plain string descriptions as-is", async () => {
    const { adfToPlainText } = await import("./jira.js");
    expect(adfToPlainText("  Hello world  ")).toBe("Hello world");
  });

  it("extracts text from ADF paragraphs and lists", async () => {
    const { adfToPlainText } = await import("./jira.js");
    const adf = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "First line." }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Bullet one" }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(adfToPlainText(adf)).toContain("First line.");
    expect(adfToPlainText(adf)).toContain("• Bullet one");
  });
});

describe("isValidJiraIssueKey", () => {
  it("accepts common keys and rejects invalid input", async () => {
    const { isValidJiraIssueKey } = await import("./jira.js");
    expect(isValidJiraIssueKey("PROJ-123")).toBe(true);
    expect(isValidJiraIssueKey("proj-1")).toBe(true);
    expect(isValidJiraIssueKey("")).toBe(false);
    expect(isValidJiraIssueKey("PROJ")).toBe(false);
    expect(isValidJiraIssueKey("123-PROJ")).toBe(false);
  });
});

describe("formatJiraEstimateFriendly", () => {
  it("expands Jira shorthand into readable durations", async () => {
    const { formatJiraEstimateFriendly } = await import("./jira.js");
    expect(formatJiraEstimateFriendly("4d")).toBe("4 days");
    expect(formatJiraEstimateFriendly("1d")).toBe("1 day");
    expect(formatJiraEstimateFriendly("2h")).toBe("2 hours");
    expect(formatJiraEstimateFriendly("1h")).toBe("1 hour");
    expect(formatJiraEstimateFriendly("30m")).toBe("30 minutes");
    expect(formatJiraEstimateFriendly("3w 4d 2h")).toBe("3 weeks 4 days 2 hours");
    expect(formatJiraEstimateFriendly("1h 30m")).toBe("1 hour 30 minutes");
    expect(formatJiraEstimateFriendly("<1m")).toBe("Less than 1 minute");
    expect(formatJiraEstimateFriendly("—")).toBe("—");
  });
});

describe("formatDurationSeconds", () => {
  it("formats seconds into compact labels", async () => {
    const { formatDurationSeconds } = await import("./jira.js");
    expect(formatDurationSeconds(null)).toBe("—");
    expect(formatDurationSeconds(0)).toBe("—");
    expect(formatDurationSeconds(3600)).toBe("1h");
    expect(formatDurationSeconds(5400)).toBe("1h 30m");
    expect(formatDurationSeconds(45)).toBe("<1m");
  });
});

describe("calendarDaysSinceIso", () => {
  it("counts inclusive local calendar days through today", async () => {
    const { calendarDaysSinceIso } = await import("./jira.js");
    const now = new Date(2026, 4, 19, 15, 0, 0);
    expect(calendarDaysSinceIso("2026-05-19T08:00:00.000Z", now)).toBe(0);
    expect(calendarDaysSinceIso("2026-05-17T23:59:59.000Z", now)).toBe(2);
    expect(calendarDaysSinceIso("bad", now)).toBeNull();
  });
});

describe("parseLastStatusChangeAt", () => {
  it("returns the newest status transition timestamp", async () => {
    const { parseLastStatusChangeAt } = await import("./jira.js");
    expect(
      parseLastStatusChangeAt([
        {
          created: "2026-05-10T10:00:00.000Z",
          items: [{ field: "summary", fromString: "A", toString: "B" }],
        },
        {
          created: "2026-05-12T10:00:00.000Z",
          items: [{ field: "status", fromString: "To Do", toString: "In Progress" }],
        },
      ])
    ).toBe("2026-05-12T10:00:00.000Z");
    expect(parseLastStatusChangeAt([])).toBeNull();
    expect(parseLastStatusChangeAt(undefined)).toBeNull();
  });
});

describe("countSubtaskProgress", () => {
  it("counts done children using Jira status category", async () => {
    const { countSubtaskProgress } = await import("./jira.js");
    expect(
      countSubtaskProgress([
        { fields: { status: { statusCategory: { key: "done" } } } },
        { fields: { status: { statusCategory: { key: "indeterminate" } } } },
        { fields: { status: { statusCategory: { key: "done" } } } },
      ])
    ).toEqual({ total: 3, done: 2 });
    expect(countSubtaskProgress([])).toEqual({ total: 0, done: 0 });
  });
});
