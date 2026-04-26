import type { JiraEnv } from "./jira.js";
import { jiraRequestJson } from "./jira.js";

export type DirectReportRow = {
  configuredName: string;
  accountId: string | null;
  displayName: string;
  avatarUrl: string | null;
  peopleUrl: string | null;
  hint: string | null;
};

type UserBean = {
  accountId?: string;
  displayName?: string;
  avatarUrls?: Record<string, string>;
};

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseReportLine(line: string): { name: string; accountIdHint: string | null } {
  const trimmed = line.trim();
  if (!trimmed) return { name: "", accountIdHint: null };
  const pipe = trimmed.indexOf("|");
  if (pipe === -1) return { name: trimmed, accountIdHint: null };
  const name = trimmed.slice(0, pipe).trim();
  const id = trimmed.slice(pipe + 1).trim();
  return { name, accountIdHint: id || null };
}

const DEFAULT_DIRECT_REPORT_LINES = [
  "Austin Carpenter",
  "Ryan Rose",
  "Calista Helinski",
  "Brooke Bowers",
  "Dylan Baine",
  "Shawn Hott",
  "Jacob Mills",
  "Ihor Bystrevskyi",
  "Billy Larsen",
];

export function parseDirectReportNamesFromEnv(): string[] {
  const raw = (process.env.JIRA_DIRECT_REPORTS ?? "").trim();
  const fromEnv = raw
    ? raw
        .split(/\r?\n/)
        .flatMap((line) => line.split(","))
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return fromEnv.length ? fromEnv : [...DEFAULT_DIRECT_REPORT_LINES];
}

function pickUser(
  configuredName: string,
  users: UserBean[]
): { user: UserBean | null; hint: string | null } {
  if (!users.length) {
    return { user: null, hint: "No Jira user found (check spelling or permissions)." };
  }
  const n = normName(configuredName);
  const exact = users.find((u) => normName(u.displayName ?? "") === n);
  if (exact) return { user: exact, hint: null };

  const words = n.split(" ").filter(Boolean);
  const allWords = users.filter((u) => {
    const d = normName(u.displayName ?? "");
    return words.length > 0 && words.every((w) => d.includes(w));
  });
  if (allWords.length === 1) return { user: allWords[0], hint: null };
  if (allWords.length > 1) {
    return {
      user: allWords[0],
      hint: `Multiple matches (${allWords.length}); using first. Add "|accountId" after the name in JIRA_DIRECT_REPORTS.`,
    };
  }

  if (users.length === 1) {
    return { user: users[0], hint: "Single partial match — verify display name in Jira." };
  }
  return {
    user: users[0],
    hint: `Several candidates (${users.length}); using first. Refine with "|accountId".`,
  };
}

async function fetchUserByAccountId(env: JiraEnv, accountId: string): Promise<UserBean | null> {
  try {
    return (await jiraRequestJson(
      env,
      `/rest/api/3/user?accountId=${encodeURIComponent(accountId)}`
    )) as UserBean;
  } catch {
    return null;
  }
}

async function searchUsers(env: JiraEnv, query: string): Promise<UserBean[]> {
  const q = encodeURIComponent(query);
  const data = (await jiraRequestJson(
    env,
    `/rest/api/3/user/search?query=${q}&maxResults=25`
  )) as unknown;
  return Array.isArray(data) ? (data as UserBean[]) : [];
}

function rowFromUser(
  env: JiraEnv,
  configuredName: string,
  user: UserBean,
  hint: string | null
): DirectReportRow {
  const accountId = user.accountId ?? null;
  const displayName = user.displayName ?? configuredName;
  const avatarUrl =
    user.avatarUrls?.["48x48"] ?? user.avatarUrls?.["32x32"] ?? user.avatarUrls?.["24x24"] ?? null;
  const peopleUrl = accountId ? `${env.site}/jira/people/${encodeURIComponent(accountId)}` : null;
  return {
    configuredName,
    accountId,
    displayName,
    avatarUrl,
    peopleUrl,
    hint,
  };
}

async function resolveDirectReportLine(env: JiraEnv, line: string): Promise<DirectReportRow | null> {
  const { name, accountIdHint } = parseReportLine(line);
  if (!name && !accountIdHint) return null;

  if (accountIdHint) {
    const user = await fetchUserByAccountId(env, accountIdHint);
    if (user?.accountId) {
      return rowFromUser(env, name || user.displayName || accountIdHint, user, null);
    }
    return {
      configuredName: name || accountIdHint,
      accountId: null,
      displayName: name || accountIdHint,
      avatarUrl: null,
      peopleUrl: null,
      hint: "Invalid accountId or no permission to view this user.",
    };
  }

  const users = await searchUsers(env, name);
  const { user, hint } = pickUser(name, users);
  if (!user) {
    return {
      configuredName: name,
      accountId: null,
      displayName: name,
      avatarUrl: null,
      peopleUrl: null,
      hint: hint ?? "Not found",
    };
  }
  return rowFromUser(env, name, user, hint);
}

export async function resolveDirectReports(env: JiraEnv, lines: string[]): Promise<DirectReportRow[]> {
  const rows = await Promise.all(lines.map((line) => resolveDirectReportLine(env, line)));
  return rows.filter((r): r is DirectReportRow => r != null);
}
