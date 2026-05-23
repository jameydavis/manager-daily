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

/** Common Jira story / issue template section titles (case-insensitive). */
export const ISSUE_DESCRIPTION_SUBHEADINGS = [
  "Acceptance Criteria",
  "Action Items",
  "Actual Behavior",
  "API Changes",
  "Approach",
  "Architecture",
  "Assumptions",
  "Background",
  "Business Value",
  "Checklist",
  "Constraints",
  "Context",
  "Database Changes",
  "Definition of Done",
  "Dependencies",
  "Description",
  "Design",
  "Details",
  "Dev Notes",
  "Developer Notes",
  "Documentation",
  "DoD",
  "Done",
  "Environment",
  "Expected Behavior",
  "Follow Up",
  "Follow-up",
  "Future Work",
  "Goals",
  "How",
  "Impact",
  "Implementation",
  "Implementation Notes",
  "In Scope",
  "Links",
  "Migration",
  "Monitoring",
  "Next Steps",
  "Non-Goals",
  "Notes",
  "Objective",
  "Open Items",
  "Open Questions",
  "Out of Scope",
  "Out of scope",
  "Overview",
  "Performance",
  "Plan",
  "Problem",
  "Proposal",
  "QA",
  "QA Notes",
  "References",
  "Related Work",
  "Release Plan",
  "Requirements",
  "Resources",
  "Risks",
  "Rollout",
  "Rollout Plan",
  "Scope",
  "Security",
  "Solution",
  "Steps to Reproduce",
  "Stakeholders",
  "Success Criteria",
  "Success Metrics",
  "Summary",
  "Tasks",
  "Technical Approach",
  "Technical Details",
  "Technical Notes",
  "Test Plan",
  "Testing",
  "Timeline",
  "To Do",
  "User Impact",
  "User Story",
  "What",
  "When",
  "Where",
  "Who",
  "Why",
  "Workaround",
] as const;

export type IssueDescriptionSection = {
  heading: string | null;
  body: string;
};

/** Match a standalone template subheading line; returns canonical title or null. */
export function matchIssueDescriptionSubheading(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/:+\s*$/, "").toLowerCase();
  return ISSUE_DESCRIPTION_SUBHEADINGS.find((h) => h.toLowerCase() === normalized) ?? null;
}

/** True when a description line is a standalone template subheading (e.g. "What" or "Why:"). */
export function isIssueDescriptionSubheading(line: string): boolean {
  return matchIssueDescriptionSubheading(line) != null;
}

/** Split plain-text issue descriptions into template sections for modal rendering. */
export function parseIssueDescriptionSections(text: string): IssueDescriptionSection[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const sections: IssueDescriptionSection[] = [];
  let currentHeading: string | null = null;
  let bodyLines: string[] = [];

  const flush = () => {
    const body = bodyLines.join("\n").trim();
    if (currentHeading != null || body) {
      sections.push({ heading: currentHeading, body });
    }
    bodyLines = [];
  };

  for (const line of lines) {
    const matched = matchIssueDescriptionSubheading(line);
    if (matched) {
      flush();
      currentHeading = matched;
    } else {
      bodyLines.push(line);
    }
  }
  flush();

  if (sections.length === 1 && sections[0]!.heading == null) {
    return sections;
  }
  return sections.filter((s) => s.heading != null || s.body.length > 0);
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
    created?: string;
    updated?: string;
    description?: unknown;
    reporter?: { displayName?: string };
    timeoriginalestimate?: number | null;
    timespent?: number | null;
    aggregatetimespent?: number | null;
    timetracking?: { originalEstimate?: string };
  };
};

export type JiraIssueStaleness = {
  createdAt: string;
  updatedAt: string;
  lastStatusChangeAt: string;
  daysSinceCreated: number;
  daysSinceUpdated: number;
  daysSinceStatusChange: number;
};

export type JiraSubtaskProgress = {
  total: number;
  done: number;
};

export type JiraIssueModalDetails = {
  description: string;
  descriptionSections: IssueDescriptionSection[];
  originalEstimate: string;
  reporter: string;
  timeLogged: string;
  timeLoggedSeconds: number | null;
  originalEstimateSeconds: number | null;
  staleness: JiraIssueStaleness | null;
  subtaskProgress: JiraSubtaskProgress | null;
};

type ChangelogHistory = {
  created?: string;
  items?: Array<{ field?: string }>;
};

type ChangelogPage = {
  startAt?: number;
  maxResults?: number;
  total?: number;
  values?: ChangelogHistory[];
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Calendar days from an ISO instant through today (local midnight boundaries). */
export function calendarDaysSinceIso(iso: string, now: Date = new Date()): number | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  const start = startOfLocalDay(parsed);
  const end = startOfLocalDay(now);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

/** Most recent status transition timestamp from a Jira changelog page (newest last). */
export function parseLastStatusChangeAt(histories: ChangelogHistory[] | undefined): string | null {
  if (!histories?.length) return null;
  for (let i = histories.length - 1; i >= 0; i--) {
    const history = histories[i];
    if (!history.items?.some((item) => item.field === "status")) continue;
    const created = history.created?.trim();
    if (created) return created;
  }
  return null;
}

function buildStaleness(
  createdAt: string | null | undefined,
  updatedAt: string | null | undefined,
  lastStatusChangeAt: string | null | undefined,
  now: Date = new Date()
): JiraIssueStaleness | null {
  const created = typeof createdAt === "string" ? createdAt.trim() : "";
  const updated = typeof updatedAt === "string" ? updatedAt.trim() : "";
  if (!created || !updated) return null;
  const statusAt = (typeof lastStatusChangeAt === "string" && lastStatusChangeAt.trim()) || created;
  const daysSinceCreated = calendarDaysSinceIso(created, now);
  const daysSinceUpdated = calendarDaysSinceIso(updated, now);
  const daysSinceStatusChange = calendarDaysSinceIso(statusAt, now);
  if (daysSinceCreated == null || daysSinceUpdated == null || daysSinceStatusChange == null) return null;
  return {
    createdAt: created,
    updatedAt: updated,
    lastStatusChangeAt: statusAt,
    daysSinceCreated,
    daysSinceUpdated,
    daysSinceStatusChange,
  };
}

async function fetchLastStatusChangeAt(env: JiraEnv, key: string): Promise<string | null> {
  const meta = (await jiraRequestJson(
    env,
    `/rest/api/3/issue/${encodeURIComponent(key)}/changelog?maxResults=0`
  )) as ChangelogPage;
  const total = meta.total ?? 0;
  if (total <= 0) return null;
  const pageSize = 100;
  const startAt = Math.max(0, total - pageSize);
  const page = (await jiraRequestJson(
    env,
    `/rest/api/3/issue/${encodeURIComponent(key)}/changelog?startAt=${startAt}&maxResults=${pageSize}`
  )) as ChangelogPage;
  return parseLastStatusChangeAt(page.values);
}

type SubtaskSearchResponse = {
  issues?: Array<{
    fields?: {
      status?: { statusCategory?: { key?: string } };
    };
  }>;
};

/** Count done vs total child issues from a Jira parent search (`parent = KEY`). */
export function countSubtaskProgress(
  issues: SubtaskSearchResponse["issues"]
): JiraSubtaskProgress {
  const list = issues ?? [];
  let done = 0;
  for (const issue of list) {
    if (issue.fields?.status?.statusCategory?.key === "done") done += 1;
  }
  return { total: list.length, done };
}

async function fetchSubtaskProgress(env: JiraEnv, parentKey: string): Promise<JiraSubtaskProgress | null> {
  try {
    const body = {
      jql: `parent = ${parentKey}`,
      maxResults: 100,
      fields: ["status"],
    };
    const data = (await jiraRequestJson(env, "/rest/api/3/search/jql", {
      method: "POST",
      body: JSON.stringify(body),
    })) as SubtaskSearchResponse;
    return countSubtaskProgress(data.issues);
  } catch {
    return null;
  }
}

function parseTimeLoggedSeconds(fields: IssueModalFieldsResponse["fields"]): number | null {
  const agg = fields?.aggregatetimespent;
  const ts = fields?.timespent;
  if (agg != null && agg > 0) return Math.floor(agg);
  if (ts != null && ts > 0) return Math.floor(ts);
  return null;
}

function parseOriginalEstimateSeconds(fields: IssueModalFieldsResponse["fields"]): number | null {
  const sec = fields?.timeoriginalestimate;
  if (sec != null && sec > 0) return Math.floor(sec);
  return null;
}

function parseOriginalEstimate(fields: IssueModalFieldsResponse["fields"]): string {
  const human = fields?.timetracking?.originalEstimate?.trim();
  if (human) return formatJiraEstimateFriendly(human);
  return formatJiraEstimateFriendly(formatDurationSeconds(fields?.timeoriginalestimate));
}

function parseReporter(fields: IssueModalFieldsResponse["fields"]): string {
  const name = fields?.reporter?.displayName?.trim();
  return name || "—";
}

/** Fetch description, reporter, estimate, and staleness metrics for the detail modal. */
export async function fetchIssueModalDetails(env: JiraEnv, key: string): Promise<JiraIssueModalDetails> {
  const normalized = key.trim().toUpperCase();
  const fieldList = [
    "created",
    "updated",
    "description",
    "reporter",
    "timeoriginalestimate",
    "timetracking",
    "timespent",
    "aggregatetimespent",
  ];
  const [data, lastStatusChangeAt, subtaskProgress] = await Promise.all([
    jiraRequestJson(
      env,
      `/rest/api/3/issue/${encodeURIComponent(normalized)}?fields=${encodeURIComponent(fieldList.join(","))}`
    ) as Promise<IssueModalFieldsResponse>,
    fetchLastStatusChangeAt(env, normalized),
    fetchSubtaskProgress(env, normalized),
  ]);
  const fields = data.fields;
  const timeLoggedSeconds = parseTimeLoggedSeconds(fields);
  const originalEstimateSeconds = parseOriginalEstimateSeconds(fields);
  const description = adfToPlainText(fields?.description);
  return {
    description,
    descriptionSections: parseIssueDescriptionSections(description),
    originalEstimate: parseOriginalEstimate(fields),
    reporter: parseReporter(fields),
    timeLogged: formatDurationSeconds(timeLoggedSeconds),
    timeLoggedSeconds,
    originalEstimateSeconds,
    staleness: buildStaleness(fields?.created, fields?.updated, lastStatusChangeAt),
    subtaskProgress,
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
