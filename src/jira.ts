import { Buffer } from "node:buffer";

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
  const jql =
    (process.env.JIRA_JQL ?? "").trim() ||
    "assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC";
  return { site, email, token, jql };
}

export type JiraIssue = {
  key: string;
  summary: string;
  status: string;
  issueType: string;
  browseUrl: string;
};

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
