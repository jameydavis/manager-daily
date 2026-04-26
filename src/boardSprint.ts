import type { JiraEnv } from "./jira.js";
import { jiraRequestJson } from "./jira.js";

/** Board id from board URL: .../boards/1577 or rapidView=1577 */
export function getJiraBoardIdFromEnv(): number | null {
  const raw = process.env.JIRA_BOARD_ID?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

type AgileBoard = {
  name?: string;
};

type AgileSprintList = {
  values?: Array<{
    name?: string;
    state?: string;
    startDate?: string;
    endDate?: string;
  }>;
};

/**
 * Board metadata (Agile REST).
 * https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/#api-agile-1-0-board-boardid-get
 */
export async function fetchAgileBoard(env: JiraEnv, boardId: number): Promise<{ name: string } | null> {
  const data = (await jiraRequestJson(env, `/rest/agile/1.0/board/${boardId}`)) as AgileBoard;
  const name = data.name?.trim();
  if (!name) return null;
  return { name };
}

/** ISO 8601 from Jira → YYYY-MM-DD (UTC calendar date). */
function isoToDay(iso: string | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Active sprint for a Scrum/Kanban board (Jira Software Agile REST).
 * https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/#api-agile-1-0-board-boardid-sprint-get
 */
export async function fetchActiveSprintForBoard(
  env: JiraEnv,
  boardId: number
): Promise<{ start: string; end: string; name: string } | null> {
  const data = (await jiraRequestJson(
    env,
    `/rest/agile/1.0/board/${boardId}/sprint?state=active`
  )) as AgileSprintList;

  const sprints = data.values ?? [];
  if (!sprints.length) return null;

  const s = sprints[0];
  const start = isoToDay(s.startDate);
  const end = isoToDay(s.endDate);
  if (!start || !end) return null;

  return {
    start,
    end,
    name: s.name ?? "Active sprint",
  };
}
