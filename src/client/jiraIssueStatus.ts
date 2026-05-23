export type JiraIssueStatusTone =
  | "neutral"
  | "blocked"
  | "done"
  | "review"
  | "progress"
  | "todo"
  | "default";

/** Map a Jira workflow status label to a modal tone class suffix. */
export function resolveJiraStatusTone(status: string | null | undefined): JiraIssueStatusTone {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (!s || s === "—") return "neutral";
  if (/\b(blocked|blocking|on hold|hold|waiting|impediment)\b/.test(s)) return "blocked";
  if (
    /\b(done|closed|resolved|complete|completed|released|deployed|finished|cancelled|canceled|won't fix|wont fix|duplicate)\b/.test(
      s
    )
  ) {
    return "done";
  }
  if (/\b(review|qa|test(?:ing)?|verify|verification|approval|uat|sign[- ]?off)\b/.test(s)) return "review";
  if (
    /\b(in progress|progress|develop(?:ment|ing)?|doing|active|implement(?:ing|ation)?|build(?:ing)?|coding|working|in dev)\b/.test(
      s
    )
  ) {
    return "progress";
  }
  if (/\b(to do|todo|to-do|backlog|open|new|ready|selected|planned|pending|next)\b/.test(s)) return "todo";
  return "default";
}
