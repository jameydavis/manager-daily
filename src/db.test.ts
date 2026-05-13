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

  it("dismissEmailSuggestion and listDismissedEmailFingerprints", () => {
    db.dismissEmailSuggestion("mid-123");
    expect(db.listDismissedEmailFingerprints()).toContain("mid-123");
    db.dismissEmailSuggestion("mid-123");
    expect(db.listDismissedEmailFingerprints().filter((f) => f === "mid-123")).toHaveLength(1);
  });
});
