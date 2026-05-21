import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

describe("db", () => {
  let dataDir: string;
  let db: typeof import("./db.js");

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "manager-daily-db-"));
    vi.stubEnv("DATA_DIR", dataDir);
    vi.resetModules();
    db = await import("./db.js");
  });

  afterAll(() => {
    try {
      db.closeDatabase();
    } catch {
      /* ignore */
    }
    vi.unstubAllEnvs();
    vi.resetModules();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("addTask and listTasks round-trip", () => {
    db.addTask("2026-04-01", "Buy milk", "2%");
    const rows = db.listTasks("2026-04-01");
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Buy milk");
    expect(rows[0].notes).toBe("2%");
    expect(rows[0].done).toBe(0);
  });

  it("toggleTask flips done", () => {
    db.addTask("2026-04-02", "Toggle me", null);
    const [row] = db.listTasks("2026-04-02");
    expect(row.done).toBe(0);
    expect(db.getTaskDone(row.id)).toBe(0);
    db.toggleTask(row.id);
    expect(db.listTasks("2026-04-02")[0].done).toBe(1);
    expect(db.getTaskDone(row.id)).toBe(1);
  });

  it("getTaskDone returns null for missing id", () => {
    expect(db.getTaskDone(99999)).toBeNull();
  });

  it("getTaskTitle returns title or null", () => {
    db.addTask("2026-04-04", "Named", null);
    const [row] = db.listTasks("2026-04-04");
    expect(db.getTaskTitle(row.id)).toBe("Named");
    expect(db.getTaskTitle(99999)).toBeNull();
  });

  it("completeOpenTasksWithTitle marks matching open tasks on given days", () => {
    db.addTask("2026-07-01", "Shared", null);
    db.addTask("2026-07-05", "Shared", null);
    db.addTask("2026-07-05", "Other", null);
    db.addTask("2026-07-10", "Shared", null);
    const anchor = db.listTasks("2026-07-10").find((t) => t.title === "Shared")!;
    db.toggleTask(anchor.id);
    const n = db.completeOpenTasksWithTitle("Shared", ["2026-07-10", "2026-07-05", "2026-07-01"], anchor.id);
    expect(n).toBe(2);
    expect(db.listTasks("2026-07-01")[0].done).toBe(1);
    expect(db.listTasks("2026-07-05").find((t) => t.title === "Shared")!.done).toBe(1);
    expect(db.listTasks("2026-07-05").find((t) => t.title === "Other")!.done).toBe(0);
    expect(db.listTasks("2026-07-10")[0].done).toBe(1);
  });

  it("completeOpenTasksWithTitle ignores days outside the provided list", () => {
    db.addTask("2026-07-20", "Shared", null);
    db.addTask("2026-07-28", "Shared", null);
    const [row] = db.listTasks("2026-07-28");
    db.toggleTask(row.id);
    db.completeOpenTasksWithTitle("Shared", ["2026-07-28"], row.id);
    expect(db.listTasks("2026-07-20")[0].done).toBe(0);
    expect(db.listTasks("2026-07-28")[0].done).toBe(1);
  });

  it("updateUserPasswordHash and deleteSessionsForUser", () => {
    const email = `pw-${Date.now()}@example.com`;
    const userId = db.createUser(email, "hash-a", null, null);
    const token = db.createSession(userId, 3600);
    db.updateUserPasswordHash(userId, "hash-b");
    expect(db.findUserWithHashById(userId)!.password_hash).toBe("hash-b");
    db.deleteSessionsForUser(userId);
    expect(db.consumeAndValidateSession(token)).toBeNull();
  });

  it("deleteTask removes row", () => {
    db.addTask("2026-04-03", "Gone", null);
    const [row] = db.listTasks("2026-04-03");
    db.deleteTask(row.id);
    expect(db.listTasks("2026-04-03")).toHaveLength(0);
  });

  it("carryOverIncomplete copies incomplete tasks", () => {
    db.addTask("2026-04-10", "Open", null);
    db.addTask("2026-04-10", "Done", null);
    const doneRow = db.listTasks("2026-04-10").find((t) => t.title === "Done")!;
    db.toggleTask(doneRow.id);
    const n = db.carryOverIncomplete("2026-04-10", "2026-04-11");
    expect(n).toBe(1);
    const next = db.listTasks("2026-04-11");
    expect(next.map((t) => t.title)).toEqual(["Open"]);
  });

  it("carryOverIncompleteFromDays merges open tasks from multiple days", () => {
    db.addTask("2026-08-01", "Older", null);
    db.addTask("2026-08-03", "Newer", null);
    db.addTask("2026-08-03", "Done", null);
    db.toggleTask(db.listTasks("2026-08-03").find((t) => t.title === "Done")!.id);
    const n = db.carryOverIncompleteFromDays(["2026-08-01", "2026-08-03"], "2026-08-10");
    expect(n).toBe(2);
    expect(db.listTasks("2026-08-10").map((t) => t.title)).toEqual(["Older", "Newer"]);
  });

  it("carryOverIncompleteFromDays skips titles already on the target day", () => {
    db.addTask("2026-09-01", "Already here", null);
    db.addTask("2026-09-01", "Fresh", null);
    db.addTask("2026-09-10", "Already here", null);
    db.addTask("2026-09-10", "Fresh", null);
    const n = db.carryOverIncompleteFromDays(["2026-09-01", "2026-09-05"], "2026-09-10");
    expect(n).toBe(0);
    expect(db.listTasks("2026-09-10").map((t) => t.title)).toEqual(["Already here", "Fresh"]);
  });

  it("carryOverIncompleteFromDays carries each title once across source days", () => {
    db.addTask("2026-09-20", "Repeat", null);
    db.addTask("2026-09-22", "Repeat", null);
    db.addTask("2026-09-24", "Once", null);
    const n = db.carryOverIncompleteFromDays(["2026-09-20", "2026-09-22", "2026-09-24"], "2026-09-30");
    expect(n).toBe(2);
    expect(db.listTasks("2026-09-30").map((t) => t.title)).toEqual(["Repeat", "Once"]);
  });

  it("carryOverIncompleteFromDays ignores the target day in source list", () => {
    db.addTask("2026-09-15", "Past", null);
    db.addTask("2026-09-15", "Also on target", null);
    const n = db.carryOverIncompleteFromDays(["2026-09-15", "2026-09-15"], "2026-09-15");
    expect(n).toBe(0);
    expect(db.listTasks("2026-09-15")).toHaveLength(2);
  });

  it("carryOverIncompleteFromDays returns 0 for empty source list", () => {
    expect(db.carryOverIncompleteFromDays([], "2026-09-16")).toBe(0);
  });

  it("dismissEmailSuggestion and listDismissedEmailFingerprints", () => {
    db.dismissEmailSuggestion("mid-123");
    expect(db.listDismissedEmailFingerprints()).toContain("mid-123");
    db.dismissEmailSuggestion("mid-123");
    expect(db.listDismissedEmailFingerprints().filter((f) => f === "mid-123")).toHaveLength(1);
  });

  it("upsertUserDeskPetState and getUserDeskPetState round-trip", () => {
    const userId = db.createUser(
      `desk-pet-${Date.now()}@example.com`,
      "hash",
      null,
      null
    );
    expect(db.getUserDeskPetState(userId)).toBeNull();
    const json = JSON.stringify({ v: 1, game: { fullness: 50 } });
    db.upsertUserDeskPetState(userId, json);
    const row = db.getUserDeskPetState(userId);
    expect(row?.state_json).toBe(json);
    db.upsertUserDeskPetState(userId, JSON.stringify({ v: 1, game: { fullness: 80 } }));
    expect(JSON.parse(db.getUserDeskPetState(userId)!.state_json).game.fullness).toBe(80);
  });
});
