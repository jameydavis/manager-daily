import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { projectRoot } from "./projectRoot.js";

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

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_desk_pet_state (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export type AuthUserRow = {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createUser(
  email: string,
  passwordHash: string,
  firstName: string | null,
  lastName: string | null
): number {
  const e = normalizeEmail(email);
  const fn = firstName?.trim() || null;
  const ln = lastName?.trim() || null;
  const r = db
    .prepare(
      `INSERT INTO users (email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?)`
    )
    .run(e, passwordHash, fn, ln);
  return Number(r.lastInsertRowid);
}

export function findUserWithHashByEmail(email: string): {
  id: number;
  email: string;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
} | null {
  const e = normalizeEmail(email);
  const row = db
    .prepare(
      `SELECT id, email, password_hash, first_name, last_name FROM users WHERE email = ?`
    )
    .get(e) as
    | {
        id: number;
        email: string;
        password_hash: string;
        first_name: string | null;
        last_name: string | null;
      }
    | undefined;
  return row ?? null;
}

export function findAuthUserById(id: number): AuthUserRow | null {
  const row = db
    .prepare(`SELECT id, email, first_name, last_name FROM users WHERE id = ?`)
    .get(id) as AuthUserRow | undefined;
  return row ?? null;
}

const SESSION_BYTES = 32;

export function createSession(userId: number, ttlSeconds: number): string {
  purgeExpiredSessions();
  const token = randomBytes(SESSION_BYTES).toString("hex");
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(
    token,
    userId,
    exp
  );
  return token;
}

export function consumeAndValidateSession(token: string): AuthUserRow | null {
  if (!token || token.length < SESSION_BYTES * 2) return null;
  purgeExpiredSessions();
  const row = db
    .prepare(
      `SELECT s.user_id, s.expires_at, u.id, u.email, u.first_name, u.last_name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token) as
    | {
        user_id: number;
        expires_at: number;
        id: number;
        email: string;
        first_name: string | null;
        last_name: string | null;
      }
    | undefined;
  if (!row) return null;
  if (row.expires_at <= Math.floor(Date.now() / 1000)) {
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
  };
}

export function deleteSession(token: string): void {
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

function purgeExpiredSessions(): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).run(now);
}

export type UserDeskPetStateRow = {
  state_json: string;
  updated_at: string;
};

export function getUserDeskPetState(userId: number): UserDeskPetStateRow | null {
  if (!Number.isFinite(userId)) return null;
  const row = db
    .prepare(`SELECT state_json, updated_at FROM user_desk_pet_state WHERE user_id = ?`)
    .get(userId) as UserDeskPetStateRow | undefined;
  return row ?? null;
}

export function upsertUserDeskPetState(userId: number, stateJson: string): void {
  if (!Number.isFinite(userId)) return;
  const json = stateJson.trim();
  if (!json) return;
  db.prepare(
    `INSERT INTO user_desk_pet_state (user_id, state_json, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       state_json = excluded.state_json,
       updated_at = datetime('now')`
  ).run(userId, json);
}

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

/** Title for an existing task, or `null` if missing (used before delete for flash toast). */
export function getTaskTitle(id: number): string | null {
  if (!Number.isFinite(id)) return null;
  const row = db.prepare(`SELECT title FROM tasks WHERE id = ?`).get(id) as { title: string } | undefined;
  if (!row) return null;
  return row.title;
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
  return carryOverIncompleteFromDays([fromDay], toDay);
}

/** Copies open tasks from each source day onto `toDay` (oldest day first). */
export function carryOverIncompleteFromDays(fromDays: string[], toDay: string): number {
  const days = [...new Set(fromDays.filter((d) => d && d !== toDay))];
  if (!days.length) return 0;

  const placeholders = days.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT title, notes FROM tasks WHERE day IN (${placeholders}) AND done = 0 ORDER BY day ASC, id ASC`
    )
    .all(...days) as { title: string; notes: string | null }[];

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
