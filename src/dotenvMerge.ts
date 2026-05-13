import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "./projectRoot.js";

const JIRA_KEYS = ["ATLASSIAN_EMAIL", "ATLASSIAN_API_TOKEN", "ATLASSIAN_SITE", "JIRA_BOARD_ID"] as const;

function formatEnvLine(key: string, value: string): string {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value) && !value.includes("\n")) {
    return `${key}=${value}`;
  }
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  return `${key}="${escaped}"`;
}

export type JiraEnvMergeInput = {
  email: string;
  site: string;
  token: string;
  boardId: number;
};

/**
 * Updates or appends Jira-related keys in the project `.env` file.
 * Preserves unrelated lines and comments. Uses `projectRoot`, not `process.cwd()`.
 */
export function mergeJiraCredentialsIntoDotenv(input: JiraEnvMergeInput, root = projectRoot): void {
  const updates: Record<string, string> = {
    ATLASSIAN_EMAIL: input.email.trim(),
    ATLASSIAN_API_TOKEN: input.token.trim(),
    ATLASSIAN_SITE: input.site.trim().replace(/\/$/, ""),
    JIRA_BOARD_ID: String(Math.trunc(input.boardId)),
  };

  const envPath = path.join(root, ".env");
  const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = content.split(/\r?\n/);
  const keySet = new Set<string>(JIRA_KEYS);
  const replaced = new Set<string>();
  const out: string[] = [];

  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && keySet.has(m[1])) {
      const key = m[1] as (typeof JIRA_KEYS)[number];
      out.push(formatEnvLine(key, updates[key]));
      replaced.add(key);
      continue;
    }
    out.push(line);
  }

  for (const key of JIRA_KEYS) {
    if (!replaced.has(key)) {
      out.push(formatEnvLine(key, updates[key]));
    }
  }

  fs.writeFileSync(envPath, out.join("\n").replace(/\n+$/, "") + "\n", "utf8");
}
