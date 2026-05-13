import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mergeJiraCredentialsIntoDotenv } from "./dotenvMerge.js";

describe("mergeJiraCredentialsIntoDotenv", () => {
  it("creates .env with Jira keys when missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "md-env-"));
    mergeJiraCredentialsIntoDotenv(
      {
        email: "you@example.com",
        site: "https://acme.atlassian.net",
        token: "tok_with=special",
        boardId: 1577,
      },
      dir
    );
    const text = fs.readFileSync(path.join(dir, ".env"), "utf8");
    expect(text).toContain("ATLASSIAN_EMAIL=you@example.com");
    expect(text).toContain('ATLASSIAN_API_TOKEN="tok_with=special"');
    expect(text).toContain("ATLASSIAN_SITE=https://acme.atlassian.net");
    expect(text).toContain("JIRA_BOARD_ID=1577");
  });

  it("replaces existing Jira lines and keeps other lines", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "md-env-"));
    fs.writeFileSync(
      path.join(dir, ".env"),
      "PORT=3000\nATLASSIAN_SITE=https://old.atlassian.net\n# comment\n",
      "utf8"
    );
    mergeJiraCredentialsIntoDotenv(
      {
        email: "a@b.co",
        site: "https://new.atlassian.net",
        token: "secret",
        boardId: 42,
      },
      dir
    );
    const lines = fs.readFileSync(path.join(dir, ".env"), "utf8").split("\n");
    expect(lines.some((l) => l.startsWith("PORT=3000"))).toBe(true);
    expect(lines.some((l) => l === "# comment")).toBe(true);
    expect(lines.filter((l) => l.startsWith("ATLASSIAN_SITE=")).length).toBe(1);
    expect(lines.some((l) => l === "ATLASSIAN_SITE=https://new.atlassian.net")).toBe(true);
    expect(lines.some((l) => l === "JIRA_BOARD_ID=42")).toBe(true);
  });
});
