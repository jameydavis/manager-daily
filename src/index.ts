import "dotenv/config";
import "./timezone.js";
import path from "node:path";
import express from "express";
import { z } from "zod";
import {
  addTask,
  carryOverIncomplete,
  deleteTask,
  dismissEmailSuggestion,
  listDismissedEmailFingerprints,
  listTasks,
  toggleTask,
} from "./db.js";
import {
  formatDay,
  monthGrid,
  parseDay,
  prevCalendarDay,
  sprintDaysLeftPhrase,
  today,
} from "./dates.js";
import {
  fetchActiveSprintForBoard,
  fetchAgileBoard,
  getJiraBoardIdFromEnv,
} from "./boardSprint.js";
import { parseDirectReportNamesFromEnv, resolveDirectReports } from "./directReports.js";
import { enrichDirectReportsWithIssues } from "./reportAssigneeIssues.js";
import { getJiraEnv, searchIssues } from "./jira.js";
import { fetchImportantEmailMatches, importantEmailConfigured } from "./importantEmail.js";

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));

const dayParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const fingerprintParam = z.string().trim().min(1).max(500);

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
    const tasks = listTasks(selected);
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
  res.redirect(`/?date=${encodeURIComponent(day.data)}`);
});

app.post("/tasks/:id/toggle", (req, res) => {
  const id = Number(req.params.id);
  if (Number.isFinite(id)) toggleTask(id);
  res.redirect(req.get("referer") || "/");
});

app.post("/tasks/:id/delete", (req, res) => {
  const id = Number(req.params.id);
  if (Number.isFinite(id)) deleteTask(id);
  res.redirect(req.get("referer") || "/");
});

app.post("/carry-over", (req, res) => {
  const day = dayParam.safeParse(req.body.day);
  if (!day.success) {
    res.redirect("/");
    return;
  }
  const from = prevCalendarDay(day.data);
  if (from) carryOverIncomplete(from, day.data);
  res.redirect(`/?date=${encodeURIComponent(day.data)}`);
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
  res.redirect(`/?date=${encodeURIComponent(day.data)}`);
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
  res.redirect(`/?date=${encodeURIComponent(day.data)}`);
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

app.listen(PORT, () => {
  console.log(`Manager Daily: http://127.0.0.1:${PORT}`);
});
