import type { DirectReportRow } from "./directReports.js";
import type { JiraEnv } from "./jira.js";
import { jiraRequestJson } from "./jira.js";

const IN_PROGRESS_STATUS = "In Progress";

export type ReportAssigneeIssue = {
  key: string;
  summary: string;
  status: string;
  issueType: string;
  timeLoggedLabel: string;
  browseUrl: string;
};

export type DirectReportRowWithIssues = DirectReportRow & {
  assigneeIssuesInProgress: ReportAssigneeIssue[];
  assigneeIssuesOther: ReportAssigneeIssue[];
  assigneeIssuesError: string | null;
};

type SearchJqlResponse = {
  issues?: Array<{
    key: string;
    fields?: {
      summary?: string;
      status?: { name?: string };
      issuetype?: { name?: string };
      timespent?: number | null;
      aggregatetimespent?: number | null;
    };
  }>;
};

export function formatLoggedTime(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || totalSeconds <= 0) return "—";
  const sec = Math.floor(totalSeconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

function mapIssue(env: JiraEnv, i: NonNullable<SearchJqlResponse["issues"]>[number]): ReportAssigneeIssue {
  const f = i.fields ?? {};
  const agg = f.aggregatetimespent;
  const ts = f.timespent;
  const seconds = agg != null && agg > 0 ? agg : ts != null && ts > 0 ? ts : null;
  return {
    key: i.key,
    summary: f.summary ?? "",
    status: f.status?.name ?? "",
    issueType: f.issuetype?.name ?? "",
    timeLoggedLabel: formatLoggedTime(seconds),
    browseUrl: `${env.site}/browse/${i.key}`,
  };
}

/** Unresolved assignee issues excluding dead statuses; split for UI. */
export async function fetchAssigneeOpenIssues(
  env: JiraEnv,
  accountId: string
): Promise<{
  inProgress: ReportAssigneeIssue[];
  other: ReportAssigneeIssue[];
  error: string | null;
}> {
  const max = Math.min(50, Math.max(1, Number(process.env.REPORT_ASSIGNEE_MAX_ISSUES) || 20));
  const safeId = accountId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const jql = `assignee = "${safeId}" AND resolution = Unresolved AND status not in ("Backlog", "Ready For Release", "Refinement") ORDER BY updated DESC`;
  const body = {
    jql,
    maxResults: max,
    fields: ["summary", "status", "issuetype", "timespent", "aggregatetimespent"],
  };
  try {
    const data = (await jiraRequestJson(env, "/rest/api/3/search/jql", {
      method: "POST",
      body: JSON.stringify(body),
    })) as SearchJqlResponse;

    const issues = (data.issues ?? []).map((i) => mapIssue(env, i));
    const inProgress = issues.filter((x) => x.status === IN_PROGRESS_STATUS);
    const other = issues.filter((x) => x.status !== IN_PROGRESS_STATUS);
    return { inProgress, other, error: null };
  } catch (e) {
    return {
      inProgress: [],
      other: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function enrichDirectReportsWithIssues(
  env: JiraEnv | null,
  rows: DirectReportRow[]
): Promise<DirectReportRowWithIssues[]> {
  if (!env) {
    return rows.map((r) => ({
      ...r,
      assigneeIssuesInProgress: [],
      assigneeIssuesOther: [],
      assigneeIssuesError: null,
    }));
  }
  return Promise.all(
    rows.map(async (r) => {
      if (!r.accountId) {
        return {
          ...r,
          assigneeIssuesInProgress: [],
          assigneeIssuesOther: [],
          assigneeIssuesError: null,
        };
      }
      const { inProgress, other, error } = await fetchAssigneeOpenIssues(env, r.accountId);
      return {
        ...r,
        assigneeIssuesInProgress: inProgress,
        assigneeIssuesOther: other,
        assigneeIssuesError: error,
      };
    })
  );
}
