import "dotenv/config";
import "./timezone.js";
import path from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import { z } from "zod";
import { authUserDisplayLabel } from "./authTypes.js";
import {
  attachAuthUser,
  logoutSession,
  requireAuth,
  setSessionCookie,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "./authMiddleware.js";
import {
  changePasswordBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  signupBodySchema,
} from "./authValidation.js";
import { authMailConfigured, authMailDevFallbackEnabled } from "./authMail.js";
import { changeUserPassword, requestPasswordReset } from "./passwordReset.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import {
  addTask,
  carryOverIncompleteFromDays,
  createSession,
  createUser,
  deleteTask,
  dismissEmailSuggestion,
  findUserWithHashByEmail,
  completeOpenTasksWithTitle,
  getTaskDone,
  getTaskTitle,
  getUserDeskPetState,
  listDismissedEmailFingerprints,
  listTasks,
  normalizeEmail,
  toggleTask,
  upsertUserDeskPetState,
  type TaskRow,
} from "./db.js";
import { deskPetSyncStateSchema, parseDeskPetSyncState } from "./deskPetState.js";
import { DEFAULT_JIRA_JQL, encodeJiraIssueForModal, fetchIssueModalDetails, getJiraEnv, isValidJiraIssueKey, searchIssues } from "./jira.js";
import { mergeJiraCredentialsIntoDotenv } from "./dotenvMerge.js";
import { verifyJiraSignupCredentials } from "./jiraSignupVerify.js";
import {
  formatDay,
  monthGrid,
  parseDay,
  prevCalendarDay,
  previousCalendarDays,
  sprintDaysLeftPhrase,
  sprintDaysLeftInclusive,
  sprintInclusiveDaysBetween,
  sprintProgressPercent,
  today,
} from "./dates.js";

/** Incomplete tasks from this many calendar days before today are eligible for carry-over. */
export const CARRY_OVER_LOOKBACK_DAYS = 14;
import {
  fetchActiveSprintForBoard,
  fetchAgileBoard,
  getJiraBoardIdFromEnv,
} from "./boardSprint.js";
import { parseDirectReportNamesFromEnv, resolveDirectReports } from "./directReports.js";
import { enrichDirectReportsWithIssues } from "./reportAssigneeIssues.js";
import { fetchImportantEmailMatches, importantEmailConfigured } from "./importantEmail.js";
import { homeForDay, safeRedirectPath, withTaskRemovedFlash } from "./httpHelpers.js";

/** Title for tasks created via the “Follow up from email” paste form. */
export const EMAIL_FOLLOW_UP_TITLE = "Follow up from Email";

/** Mirrored from `localStorage` in `public/user-settings.js` so the server can pre-order tasks. */
export const TASKS_COMPLETED_BOTTOM_COOKIE = "dailyDashboardTasksCompletedBottom";

export function sortTasksWithCompletedLast(rows: TaskRow[]): TaskRow[] {
  return [...rows].sort((a, b) => {
    if (a.done !== b.done) return a.done - b.done;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id - b.id;
  });
}

export function buildApp(): express.Express {
  const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));
app.locals.authUserDisplayLabel = authUserDisplayLabel;
app.locals.encodeJiraIssueForModal = encodeJiraIssueForModal;

app.use(cookieParser());
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(attachAuthUser);
app.use(express.static(path.join(process.cwd(), "public")));

const dayParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const fingerprintParam = z.string().trim().min(1).max(500);

function cookieSessionTtlSeconds(): number {
  return SESSION_TTL_SECONDS;
}

app.get("/login", (req, res) => {
  if (req.authUser) {
    res.redirect(safeRedirectPath(req.query.redirect, "/"));
    return;
  }
  res.render("login", {
    errors: null as string[] | null,
    redirect: safeRedirectPath(req.query.redirect, "/"),
    formEmail: "",
  });
});

function signupWizardStepForIssues(issues: z.ZodIssue[]): 1 | 2 {
  const step2 = new Set(["atlassianSite", "atlassianApiToken", "jiraBoardId"]);
  const hit2 = issues.some((i) => i.path[0] != null && step2.has(String(i.path[0])));
  return hit2 ? 2 : 1;
}

function readSignupForm(body: Record<string, unknown>): {
  formEmail: string;
  formFirst: string;
  formLast: string;
  formAtlassianSite: string;
  formJiraBoardId: string;
} {
  return {
    formEmail: typeof body.email === "string" ? body.email : "",
    formFirst: typeof body.firstName === "string" ? body.firstName : "",
    formLast: typeof body.lastName === "string" ? body.lastName : "",
    formAtlassianSite: typeof body.atlassianSite === "string" ? body.atlassianSite : "",
    formJiraBoardId: typeof body.jiraBoardId === "string" ? body.jiraBoardId : "",
  };
}

app.get("/signup", (req, res) => {
  if (req.authUser) {
    res.redirect("/");
    return;
  }
  res.render("signup", {
    errors: null as string[] | null,
    wizardStep: 1,
    formEmail: "",
    formFirst: "",
    formLast: "",
    formAtlassianSite: "",
    formJiraBoardId: "",
  });
});

app.post("/auth/login", (req, res) => {
  const redirect = safeRedirectPath(req.body.redirect, "/");
  const parsed = loginBodySchema.safeParse({
    email: req.body.email,
    password: req.body.password,
  });
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => i.message);
    res.status(400).render("login", {
      errors,
      redirect,
      formEmail: typeof req.body.email === "string" ? req.body.email : "",
    });
    return;
  }
  const { email, password } = parsed.data;
  const row = findUserWithHashByEmail(email);
  if (!row || !verifyPassword(password, row.password_hash)) {
    res.status(400).render("login", {
      errors: ["Invalid email or password."],
      redirect,
      formEmail: email,
    });
    return;
  }
  const token = createSession(row.id, cookieSessionTtlSeconds());
  setSessionCookie(res, token);
  res.redirect(redirect);
});

app.post("/auth/signup", async (req, res, next) => {
  try {
    const forms = readSignupForm(req.body as Record<string, unknown>);
    const parsed = signupBodySchema.safeParse({
      email: req.body.email,
      password: req.body.password,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      atlassianSite: req.body.atlassianSite,
      atlassianApiToken: req.body.atlassianApiToken,
      jiraBoardId: req.body.jiraBoardId,
    });
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => i.message);
      const wizardStep = signupWizardStepForIssues(parsed.error.issues);
      res.status(400).render("signup", {
        errors,
        wizardStep,
        ...forms,
      });
      return;
    }
    const {
      email,
      password,
      firstName,
      lastName,
      atlassianSite,
      atlassianApiToken,
      jiraBoardId,
    } = parsed.data;

    const jiraEnv = {
      site: atlassianSite,
      email: normalizeEmail(email),
      token: atlassianApiToken,
      jql: (process.env.JIRA_JQL ?? "").trim() || DEFAULT_JIRA_JQL,
    };
    const jiraOk = await verifyJiraSignupCredentials(jiraEnv, jiraBoardId);
    if (!jiraOk.ok) {
      res.status(400).render("signup", {
        errors: [jiraOk.message],
        wizardStep: 2,
        ...forms,
      });
      return;
    }

    let id: number;
    try {
      id = createUser(email, hashPassword(password), firstName, lastName);
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
      const isDup =
        code === "SQLITE_CONSTRAINT_UNIQUE" ||
        (e instanceof Error && /UNIQUE|unique/i.test(e.message));
      res.status(400).render("signup", {
        errors: [isDup ? "An account with this email already exists." : "Could not create account."],
        wizardStep: isDup ? 2 : 1,
        ...forms,
      });
      return;
    }

    let envWriteFailed = false;
    try {
      mergeJiraCredentialsIntoDotenv({
        email: normalizeEmail(email),
        site: atlassianSite,
        token: atlassianApiToken,
        boardId: jiraBoardId,
      });
    } catch (err) {
      console.error("Could not write .env after signup:", err);
      envWriteFailed = true;
    }

    const token = createSession(id, cookieSessionTtlSeconds());
    setSessionCookie(res, token);
    if (envWriteFailed) {
      console.error("Signup: Jira credentials were not written to .env — add them manually.");
    }
    res.redirect("/");
  } catch (e) {
    next(e);
  }
});

app.post("/auth/logout", (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  logoutSession(res, typeof token === "string" ? token : undefined);
  res.redirect("/login");
});

app.get("/forgot-password", (req, res) => {
  if (req.authUser) {
    res.redirect("/");
    return;
  }
  res.render("forgot-password", {
    errors: null as string[] | null,
    success: null as string | null,
    formEmail: "",
    mailConfigured: authMailConfigured() || authMailDevFallbackEnabled(),
  });
});

app.post("/auth/forgot-password", async (req, res, next) => {
  try {
    if (req.authUser) {
      res.redirect("/");
      return;
    }
    const parsed = forgotPasswordBodySchema.safeParse({ email: req.body.email });
    const formEmail = typeof req.body.email === "string" ? req.body.email : "";
    const mailConfigured = authMailConfigured() || authMailDevFallbackEnabled();
    if (!parsed.success) {
      res.status(400).render("forgot-password", {
        errors: parsed.error.issues.map((i) => i.message),
        success: null,
        formEmail,
        mailConfigured,
      });
      return;
    }
    if (!mailConfigured) {
      res.status(503).render("forgot-password", {
        errors: [
          "Password reset email is not configured on this server. Ask your administrator to set AUTH_SMTP_* variables.",
        ],
        success: null,
        formEmail,
        mailConfigured: false,
      });
      return;
    }
    const result = await requestPasswordReset(parsed.data.email);
    if (!result.ok) {
      res.status(503).render("forgot-password", {
        errors: [result.message],
        success: null,
        formEmail: parsed.data.email,
        mailConfigured,
      });
      return;
    }
    res.render("forgot-password", {
      errors: null,
      success: result.message,
      formEmail: "",
      mailConfigured,
    });
  } catch (e) {
    next(e);
  }
});

app.get("/account/password", requireAuth, (req, res) => {
  res.render("change-password", {
    errors: null as string[] | null,
    success: null as string | null,
  });
});

app.post("/auth/change-password", requireAuth, (req, res) => {
  const parsed = changePasswordBodySchema.safeParse({
    currentPassword: req.body.currentPassword,
    newPassword: req.body.newPassword,
    confirmPassword: req.body.confirmPassword,
  });
  if (!parsed.success) {
    res.status(400).render("change-password", {
      errors: parsed.error.issues.map((i) => i.message),
      success: null,
    });
    return;
  }
  const user = req.authUser!;
  const result = changeUserPassword(
    user.id,
    parsed.data.currentPassword,
    parsed.data.newPassword
  );
  if (!result.ok) {
    res.status(400).render("change-password", {
      errors: [result.message],
      success: null,
    });
    return;
  }
  res.render("change-password", {
    errors: null,
    success: "Your password has been updated.",
  });
});

app.get("/api/desk-pet", (req, res) => {
  const user = req.authUser;
  if (!user) {
    res.status(401).json({ error: "Sign in to sync desk buddy." });
    return;
  }
  const row = getUserDeskPetState(user.id);
  if (!row) {
    res.json({ state: null, updatedAt: null });
    return;
  }
  try {
    const parsed = parseDeskPetSyncState(JSON.parse(row.state_json));
    if (!parsed) {
      res.json({ state: null, updatedAt: row.updated_at });
      return;
    }
    res.json({ state: parsed, updatedAt: row.updated_at });
  } catch {
    res.json({ state: null, updatedAt: row.updated_at });
  }
});

app.put("/api/desk-pet", (req, res) => {
  const user = req.authUser;
  if (!user) {
    res.status(401).json({ error: "Sign in to sync desk buddy." });
    return;
  }
  const body = z.object({ state: deskPetSyncStateSchema }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid desk buddy state." });
    return;
  }
  upsertUserDeskPetState(user.id, JSON.stringify(body.data.state));
  res.json({ ok: true, updatedAt: body.data.state.updatedAt });
});

app.get("/api/jira/issues/:key", requireAuth, async (req, res) => {
  const rawKey = typeof req.params.key === "string" ? req.params.key.trim() : "";
  if (!isValidJiraIssueKey(rawKey)) {
    res.status(400).json({ error: "Invalid issue key." });
    return;
  }
  const env = getJiraEnv();
  if (!env) {
    res.status(503).json({ error: "Jira is not configured." });
    return;
  }
  try {
    const key = rawKey.toUpperCase();
    const details = await fetchIssueModalDetails(env, key);
    res.json({ key, ...details });
  } catch (e) {
    res.status(502).json({
      error: e instanceof Error ? e.message : "Could not load issue details.",
    });
  }
});

app.get("/", async (req, res, next) => {
  try {
    const q = typeof req.query.date === "string" ? req.query.date : "";
    const selected = dayParam.safeParse(q).success ? q : today();
    const d = parseDay(selected);
    if (!d) {
      res.redirect(`/?date=${encodeURIComponent(today())}`);
      return;
    }


    const year = d.getFullYear();
    const month = d.getMonth();
    const monthLabel = d.toLocaleString("en-US", { month: "long", year: "numeric" });
    let tasks = listTasks(selected);
    if (req.cookies?.[TASKS_COMPLETED_BOTTOM_COOKIE] === "1") {
      tasks = sortTasksWithCompletedLast(tasks);
    }
    const prevDay = prevCalendarDay(selected);
    const prevMonthStart = formatDay(new Date(year, month - 1, 1));
    const nextMonthStart = formatDay(new Date(year, month + 1, 1));

    const envSprintStart = process.env.SPRINT_START?.trim() || null;
    const envSprintEnd = process.env.SPRINT_END?.trim() || null;
    let sprintHighlightStart: string | null = null;
    let sprintHighlightEnd: string | null = null;
    let sprintSource: "jira" | "env" | null = null;
    let sprintName: string | null = null;
    let jiraBoardName: string | null = null;
    let sprintBoardError: string | null = null;
    const jiraBoardId = getJiraBoardIdFromEnv();

    const jiraEnv = getJiraEnv();
    let jiraIssues: Awaited<ReturnType<typeof searchIssues>> = [];
    let jiraError: string | null = null;
    if (jiraEnv) {
      try {
        jiraIssues = await searchIssues(jiraEnv);
      } catch (e) {
        jiraError = e instanceof Error ? e.message : String(e);
      }
    }

    if (jiraEnv && jiraBoardId != null) {
      const boardPromise = fetchAgileBoard(jiraEnv, jiraBoardId).catch(() => null);
      try {
        const active = await fetchActiveSprintForBoard(jiraEnv, jiraBoardId);
        if (active) {
          sprintHighlightStart = active.start;
          sprintHighlightEnd = active.end;
          sprintSource = "jira";
          sprintName = active.name;
        }
      } catch (e) {
        sprintBoardError = e instanceof Error ? e.message : String(e);
      }
      const boardMeta = await boardPromise;
      jiraBoardName = boardMeta?.name ?? null;
    }
    if (sprintHighlightStart == null || sprintHighlightEnd == null) {
      if (envSprintStart && envSprintEnd) {
        sprintHighlightStart = envSprintStart;
        sprintHighlightEnd = envSprintEnd;
        if (!sprintSource) sprintSource = "env";
      }
    }

    const weeks = monthGrid(year, month, today(), sprintHighlightStart, sprintHighlightEnd);

    const sprintRangeActive = Boolean(sprintHighlightStart && sprintHighlightEnd);
    const calendarHeading =
      sprintRangeActive && sprintHighlightEnd
        ? `${jiraBoardName?.trim() || sprintName?.trim() || "Current sprint"} — ${sprintDaysLeftPhrase(today(), sprintHighlightEnd)}`
        : "Calendar";

    const sprintContext =
      sprintHighlightStart && sprintHighlightEnd
        ? {
            name: (jiraBoardName?.trim() || sprintName?.trim() || "Current sprint").trim(),
            start: sprintHighlightStart,
            end: sprintHighlightEnd,
            daysLeft: sprintDaysLeftInclusive(today(), sprintHighlightEnd),
            totalDays: sprintInclusiveDaysBetween(sprintHighlightStart, sprintHighlightEnd),
            progressPct: sprintProgressPercent(today(), sprintHighlightStart, sprintHighlightEnd),
          }
        : null;

    const reportLines = parseDirectReportNamesFromEnv();
    let directReports: Awaited<ReturnType<typeof enrichDirectReportsWithIssues>> = [];
    let directReportsError: string | null = null;
    if (jiraEnv && reportLines.length) {
      try {
        const resolved = await resolveDirectReports(jiraEnv, reportLines);
        directReports = await enrichDirectReportsWithIssues(jiraEnv, resolved);
      } catch (e) {
        directReportsError = e instanceof Error ? e.message : String(e);
      }
    } else if (jiraEnv) {
      directReportsError =
        "Set JIRA_DIRECT_REPORTS in .env (comma- or newline-separated names; optional Name|accountId).";
    }

    const emailConfigured = importantEmailConfigured();
    let emailMatches: Awaited<ReturnType<typeof fetchImportantEmailMatches>>["matches"] = [];
    let emailMatchError: string | null = null;
    if (emailConfigured) {
      const dismissed = new Set(listDismissedEmailFingerprints());
      const emailResult = await fetchImportantEmailMatches(dismissed);
      emailMatches = emailResult.matches;
      emailMatchError = emailResult.error;
    }

    res.render("index", {
      selected,
      monthLabel,
      tasks,
      prevDay,
      weeks,
      sprintStart: sprintHighlightStart,
      sprintEnd: sprintHighlightEnd,
      sprintSource,
      sprintName,
      jiraBoardName,
      jiraBoardId,
      sprintBoardError,
      sprintRangeActive,
      sprintContext,
      calendarHeading,
      todayISO: today(),
      prevMonthStart,
      nextMonthStart,
      jiraConfigured: Boolean(jiraEnv),
      jiraIssues,
      jiraError,
      directReports,
      directReportsError,
      emailConfigured,
      emailMatches,
      emailMatchError,
      emailFollowUpTitle: EMAIL_FOLLOW_UP_TITLE,
    });
  } catch (e) {
    next(e);
  }
});

app.post("/tasks", (req, res) => {
  const day = dayParam.safeParse(req.body.day);
  const title = typeof req.body.title === "string" ? req.body.title : "";
  const notes = typeof req.body.notes === "string" ? req.body.notes : "";
  if (!day.success || !title.trim()) {
    res.redirect(req.get("referer") || "/");
    return;
  }
  addTask(day.data, title, notes || null);
  res.redirect(homeForDay(day.data, { create: 1 }));
});

app.post("/tasks/:id/toggle", (req, res) => {
  const id = Number(req.params.id);
  const day = dayParam.safeParse(req.body.day);
  let completedTask = false;
  let completedTitle: string | null = null;
  if (Number.isFinite(id)) {
    const before = getTaskDone(id);
    if (before === 0) completedTitle = getTaskTitle(id);
    toggleTask(id);
    if (before === 0) {
      completedTask = true;
      if (completedTitle && day.success) {
        const lookbackDays = [
          day.data,
          ...previousCalendarDays(day.data, CARRY_OVER_LOOKBACK_DAYS),
        ];
        completeOpenTasksWithTitle(completedTitle, lookbackDays, id);
      }
    }
  }
  if (day.success) {
    res.redirect(
      homeForDay(
        day.data,
        completedTask ? { complete: 1, completedTitle } : undefined
      )
    );
    return;
  }
  res.redirect(req.get("referer") || "/");
});

app.post("/tasks/:id/delete", (req, res) => {
  const id = Number(req.params.id);
  const day = dayParam.safeParse(req.body.day);
  let removedTitle: string | null = null;
  if (Number.isFinite(id)) {
    removedTitle = getTaskTitle(id);
    deleteTask(id);
  }
  let target: string;
  if (day.success) {
    target = homeForDay(day.data);
  } else {
    const ref = req.get("referer");
    if (ref) {
      try {
        const r = new URL(ref);
        target = `${r.pathname}${r.search}`;
      } catch {
        target = "/";
      }
    } else {
      target = "/";
    }
  }
  res.redirect(withTaskRemovedFlash(target, removedTitle));
});

app.post("/carry-over", (_req, res) => {
  const targetDay = today();
  const fromDays = previousCalendarDays(targetDay, CARRY_OVER_LOOKBACK_DAYS);
  const created = carryOverIncompleteFromDays(fromDays, targetDay);
  res.redirect(homeForDay(targetDay, created > 0 ? { carryOver: created } : undefined));
});

app.post("/tasks/from-email-paste", (req, res) => {
  const day = dayParam.safeParse(req.body.day);
  const pasted = typeof req.body.pasted === "string" ? req.body.pasted.trim() : "";
  if (!day.success || !pasted) {
    res.redirect(req.get("referer") || "/");
    return;
  }
  addTask(day.data, EMAIL_FOLLOW_UP_TITLE, pasted);
  res.redirect(homeForDay(day.data, { create: 1 }));
});

app.post("/tasks/from-jira", (req, res) => {
  const day = dayParam.safeParse(req.body.day);
  const key = typeof req.body.key === "string" ? req.body.key.trim() : "";
  const summary = typeof req.body.summary === "string" ? req.body.summary.trim() : "";
  if (!day.success || !key) {
    res.redirect(req.get("referer") || "/");
    return;
  }
  const site = (process.env.ATLASSIAN_SITE ?? "").trim().replace(/\/$/, "");
  const notes = site ? `${site}/browse/${key}` : `Jira ${key}`;
  const title = summary ? `${key}: ${summary}` : key;
  addTask(day.data, title, notes);
  res.redirect(homeForDay(day.data, { create: 1 }));
});

app.post("/tasks/from-email", (req, res) => {
  const day = dayParam.safeParse(req.body.day);
  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  const notes = typeof req.body.notes === "string" ? req.body.notes.trim() : "";
  const fp = fingerprintParam.safeParse(typeof req.body.fingerprint === "string" ? req.body.fingerprint : "");
  if (!day.success || !title || !fp.success) {
    res.redirect(req.get("referer") || "/");
    return;
  }
  addTask(day.data, title, notes || null);
  dismissEmailSuggestion(fp.data);
  res.redirect(homeForDay(day.data, { create: 1 }));
});

app.post("/email-suggestions/dismiss", (req, res) => {
  const day = dayParam.safeParse(req.body.day);
  const fp = fingerprintParam.safeParse(typeof req.body.fingerprint === "string" ? req.body.fingerprint : "");
  if (!fp.success) {
    res.redirect(req.get("referer") || "/");
    return;
  }
  dismissEmailSuggestion(fp.data);
  const target = day.success ? `/?date=${encodeURIComponent(day.data)}` : req.get("referer") || "/";
  res.redirect(target);
});

  return app;
}
