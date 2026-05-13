import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./jira.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./jira.js")>();
  return {
    ...actual,
    jiraRequestJson: vi.fn(),
  };
});

import * as jira from "./jira.js";
import { verifyJiraSignupCredentials } from "./jiraSignupVerify.js";

describe("verifyJiraSignupCredentials", () => {
  const env = {
    site: "https://example.atlassian.net",
    email: "me@example.com",
    token: "tok",
    jql: "assignee = currentUser()",
  };

  beforeEach(() => {
    vi.mocked(jira.jiraRequestJson).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok when both Jira calls succeed", async () => {
    vi.mocked(jira.jiraRequestJson).mockResolvedValue({});
    const result = await verifyJiraSignupCredentials(env, 42);
    expect(result).toEqual({ ok: true });
    expect(jira.jiraRequestJson).toHaveBeenCalledTimes(2);
    expect(jira.jiraRequestJson).toHaveBeenNthCalledWith(1, env, "/rest/api/3/myself");
    expect(jira.jiraRequestJson).toHaveBeenNthCalledWith(2, env, "/rest/agile/1.0/board/42");
  });

  it("maps 401 from myself to credential message", async () => {
    vi.mocked(jira.jiraRequestJson).mockRejectedValueOnce(new Error("Jira HTTP 401: nope"));
    const result = await verifyJiraSignupCredentials(env, 1);
    expect(result).toEqual({
      ok: false,
      message: "Jira rejected these credentials. Check the site URL, email, and API token.",
    });
  });

  it("maps 404 from board to board message", async () => {
    vi.mocked(jira.jiraRequestJson).mockResolvedValueOnce({});
    vi.mocked(jira.jiraRequestJson).mockRejectedValueOnce(new Error("Jira HTTP 404: missing"));
    const result = await verifyJiraSignupCredentials(env, 99);
    expect(result).toEqual({
      ok: false,
      message: "No Jira board with id 99 for this site (or you cannot access it).",
    });
  });
});
