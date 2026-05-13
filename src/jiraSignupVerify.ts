import type { JiraEnv } from "./jira.js";
import { jiraRequestJson } from "./jira.js";

type VerifyFail = { ok: false; message: string };
type VerifyOk = { ok: true };

/**
 * Checks email + API token against Jira Cloud, then that the board id exists for this site.
 */
export async function verifyJiraSignupCredentials(
  env: JiraEnv,
  boardId: number
): Promise<VerifyOk | VerifyFail> {
  try {
    await jiraRequestJson(env, "/rest/api/3/myself");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/401|403/i.test(msg)) {
      return { ok: false, message: "Jira rejected these credentials. Check the site URL, email, and API token." };
    }
    return { ok: false, message: `Could not reach Jira with your account: ${msg}` };
  }

  try {
    await jiraRequestJson(env, `/rest/agile/1.0/board/${boardId}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/404/.test(msg)) {
      return { ok: false, message: `No Jira board with id ${boardId} for this site (or you cannot access it).` };
    }
    return { ok: false, message: `Could not load board ${boardId}: ${msg}` };
  }

  return { ok: true };
}
