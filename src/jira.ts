import { Buffer } from "node:buffer";

/** Default JQL when `JIRA_JQL` is unset (matches `getJiraEnv`). */
export const DEFAULT_JIRA_JQL =
  "assignee = currentUser() AND resolution IS EMPTY ORDER BY updated DESC";

export type JiraEnv = {
  site: string;
  email: string;
  token: string;
  jql: string;
};

/** Jira Cloud: email + API token (not an "API key"). https://id.atlassian.com/manage-profile/security/api-tokens */
export function getJiraEnv(): JiraEnv | null {
  const site = (process.env.ATLASSIAN_SITE ?? "").trim().replace(/\/$/, "");
  const email = (process.env.ATLASSIAN_EMAIL ?? "").trim();
  const token = (process.env.ATLASSIAN_API_TOKEN ?? "").trim();
  if (!site || !email || !token) return null;
  const jql = (process.env.JIRA_JQL ?? "").trim() || DEFAULT_JIRA_JQL;
  return { site, email, token, jql };
}

export type JiraIssue = {
  key: string;
  summary: string;
  status: string;
  issueType: string;
  browseUrl: string;
};

/** Minimal fields embedded in the page for the issue detail modal. */
export type JiraIssueModalView = {
  key: string;
  summary: string;
  status: string;
  issueType: string;
  browseUrl: string;
  timeLogged?: string;
  assignee?: string;
};

export function encodeJiraIssueForModal(issue: JiraIssueModalView): string {
  return encodeURIComponent(JSON.stringify(issue));
}

/** Jira issue keys, e.g. `PROJ-123`. */
export const JIRA_ISSUE_KEY_RE = /^[A-Za-z][A-Za-z0-9]+-\d+$/;

export function isValidJiraIssueKey(key: string): boolean {
  return JIRA_ISSUE_KEY_RE.test(key.trim());
}

/** Convert Jira Cloud ADF description (or legacy string) to plain text. */
export function adfToPlainText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node.trim();
  if (typeof node !== "object") return "";

  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === "text" && typeof n.text === "string") return n.text;
  if (n.type === "hardBreak") return "\n";
  if (!Array.isArray(n.content)) return "";

  const inner = n.content.map(adfToPlainText).join("");
  if (n.type === "paragraph" || n.type === "heading") return `${inner}\n`;
  if (n.type === "listItem") return `• ${inner.trim()}\n`;
  if (n.type === "bulletList" || n.type === "orderedList" || n.type === "blockquote") {
    return inner;
  }
  return inner;
}

/** Format Jira duration seconds for modal display (e.g. original estimate). */
export function formatDurationSeconds(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || totalSeconds <= 0) return "—";
  const sec = Math.floor(totalSeconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

function pluralUnit(n: number, singular: string, plural: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${plural}`;
}

/**
 * Turn Jira estimate strings (`4d`, `3w 4d 2h`, `1h 30m`) into readable text.
 */
export function formatJiraEstimateFriendly(raw: string): string {
  const t = raw.trim();
  if (!t || t === "—") return "—";
  if (t === "<1m") return "Less than 1 minute";
  if (/\b(days?|hours?|minutes?|weeks?)\b/i.test(t)) return t;

  const jiraTokens = [...t.matchAll(/(\d+)\s*([wdhm])/gi)];
  if (jiraTokens.length > 0) {
    const parts: string[] = [];
    for (const match of jiraTokens) {
      const n = parseInt(match[1]!, 10);
      if (!Number.isFinite(n)) continue;
      const unit = match[2]!.toLowerCase();
      if (unit === "w") parts.push(pluralUnit(n, "week", "weeks"));
      else if (unit === "d") parts.push(pluralUnit(n, "day", "days"));
      else if (unit === "h") parts.push(pluralUnit(n, "hour", "hours"));
      else if (unit === "m") parts.push(pluralUnit(n, "minute", "minutes"));
    }
    if (parts.length) return parts.join(" ");
  }

  return t;
}

type IssueModalFieldsResponse = {
  fields?: {
    description?: unknown;
    reporter?: { displayName?: string };
    timeoriginalestimate?: number | null;
    timetracking?: { originalEstimate?: string };
  };
};

export type JiraIssueModalDetails = {
  description: string;
  originalEstimate: string;
  reporter: string;
};

function parseOriginalEstimate(fields: IssueModalFieldsResponse["fields"]): string {
  const human = fields?.timetracking?.originalEstimate?.trim();
  if (human) return formatJiraEstimateFriendly(human);
  return formatJiraEstimateFriendly(formatDurationSeconds(fields?.timeoriginalestimate));
}

function parseReporter(fields: IssueModalFieldsResponse["fields"]): string {
  const name = fields?.reporter?.displayName?.trim();
  return name || "—";
}

/** Fetch description, reporter, and original estimate for the detail modal. */
export async function fetchIssueModalDetails(env: JiraEnv, key: string): Promise<JiraIssueModalDetails> {
  const normalized = key.trim().toUpperCase();
  const fieldList = ["description", "reporter", "timeoriginalestimate", "timetracking"];
  const data = (await jiraRequestJson(
    env,
    `/rest/api/3/issue/${encodeURIComponent(normalized)}?fields=${encodeURIComponent(fieldList.join(","))}`
  )) as IssueModalFieldsResponse;
  const fields = data.fields;
  return {
    description: adfToPlainText(fields?.description),
    originalEstimate: parseOriginalEstimate(fields),
    reporter: parseReporter(fields),
  };
}

type SearchResponse = {
  issues: Array<{
    key: string;
    fields: {
      summary: string;
      status?: { name?: string };
      issuetype?: { name?: string };
    };
  }>;
};

export async function jiraRequestJson(
  env: JiraEnv,
  path: string,
  init: RequestInit = {}
): Promise<unknown> {
  const url = `${env.site}${path}`;
  const auth = Buffer.from(`${env.email}:${env.token}`, "utf8").toString("base64");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Basic ${auth}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 400);
    try {
      const j = JSON.parse(text) as { errorMessages?: string[]; message?: string };
      if (j.errorMessages?.length) detail = j.errorMessages.join("; ");
      else if (j.message) detail = j.message;
    } catch {
      /* use raw slice */
    }
    throw new Error(`Jira HTTP ${res.status}: ${detail}`);
  }
  return text ? JSON.parse(text) : null;
}

export async function searchIssues(env: JiraEnv): Promise<JiraIssue[]> {
  const body = {
    jql: env.jql,
    maxResults: Math.min(50, Math.max(1, Number(process.env.JIRA_MAX_RESULTS) || 25)),
    fields: ["summary", "status", "issuetype"],
  };
  const data = (await jiraRequestJson(env, "/rest/api/3/search/jql", {
    method: "POST",
    body: JSON.stringify(body),
  })) as SearchResponse;

  return (data.issues ?? []).map((i) => ({
    key: i.key,
    summary: i.fields.summary ?? "",
    status: i.fields.status?.name ?? "",
    issueType: i.fields.issuetype?.name ?? "",
    browseUrl: `${env.site}/browse/${i.key}`,
  }));
}
