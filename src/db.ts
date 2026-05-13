import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

/** Repo root (folder with package.json), not process.cwd() — avoids writing to the wrong DB when the app is started from another directory. */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveDataDir(): string {
  const raw = process.env.DATA_DIR?.trim();
  if (!raw) return path.join(projectRoot, "data");
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(projectRoot, raw);
}

const dataDir = resolveDataDir();
const dbPath = path.join(dataDir, "manager-daily.db");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);

const tasksTable = db
  .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'`)
  .get() as { name: string } | undefined;
if (tasksTable) {
  const cols = db.prepare(`PRAGMA table_info(tasks)`).all() as { name: string }[];
  const hasDay = cols.some((c) => c.name === "day");
  if (!hasDay) {
    db.exec(`DROP TABLE IF EXISTS tasks`);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    title TEXT NOT NULL,
    notes TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_day ON tasks(day)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS email_suggestion_dismissals (
    fingerprint TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export type TaskRow = {
  id: number;
  day: string;
  title: string;
  notes: string | null;
  done: number;
  sort_order: number;
  created_at: string;
};

export function listTasks(day: string): TaskRow[] {
  return db
    .prepare(
      `SELECT id, day, title, notes, done, sort_order, created_at
       FROM tasks WHERE day = ? ORDER BY sort_order ASC, id ASC`
    )
    .all(day) as TaskRow[];
}

export function addTask(day: string, title: string, notes: string | null): void {
  const max =
    (db.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM tasks WHERE day = ?`).get(day) as {
      m: number;
    }).m + 1;
  db.prepare(
    `INSERT INTO tasks (day, title, notes, sort_order) VALUES (?, ?, ?, ?)`
  ).run(day, title.trim(), notes?.trim() || null, max);
}

/** Current `done` flag (0 or 1), or `null` if no row. */
export function getTaskDone(id: number): number | null {
  if (!Number.isFinite(id)) return null;
  const row = db.prepare(`SELECT done FROM tasks WHERE id = ?`).get(id) as { done: number } | undefined;
  if (!row) return null;
  return row.done;
}

export function toggleTask(id: number): void {
  db.prepare(`UPDATE tasks SET done = CASE WHEN done = 1 THEN 0 ELSE 1 END WHERE id = ?`).run(
    id
  );
}

export function deleteTask(id: number): void {
  db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
}

export function listDismissedEmailFingerprints(): string[] {
  const rows = db.prepare(`SELECT fingerprint FROM email_suggestion_dismissals`).all() as {
    fingerprint: string;
  }[];
  return rows.map((r) => r.fingerprint);
}

export function dismissEmailSuggestion(fingerprint: string): void {
  const fp = fingerprint.trim().slice(0, 500);
  if (!fp) return;
  db.prepare(`INSERT OR IGNORE INTO email_suggestion_dismissals (fingerprint) VALUES (?)`).run(fp);
}

export function carryOverIncomplete(fromDay: string, toDay: string): number {
  const rows = db
    .prepare(`SELECT title, notes FROM tasks WHERE day = ? AND done = 0`)
    .all(fromDay) as { title: string; notes: string | null }[];
  let max = (
    db.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM tasks WHERE day = ?`).get(toDay) as {
      m: number;
    }
  ).m;
  const insert = db.prepare(
    `INSERT INTO tasks (day, title, notes, sort_order) VALUES (?, ?, ?, ?)`
  );
  let n = 0;
  for (const r of rows) {
    max += 1;
    insert.run(toDay, r.title, r.notes, max);
    n++;
  }
  return n;
}

/** Releases the SQLite connection (e.g. tests or graceful shutdown). */
export function closeDatabase(): void {
  db.close();
}
