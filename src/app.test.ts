import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("buildApp HTTP", () => {
  let dataDir: string;
  let app: import("express").Express;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "manager-daily-app-"));
    vi.stubEnv("DATA_DIR", dataDir);
    vi.stubEnv("ATLASSIAN_SITE", "");
    vi.stubEnv("ATLASSIAN_EMAIL", "");
    vi.stubEnv("ATLASSIAN_API_TOKEN", "");
    vi.stubEnv("EMAIL_IMAP_HOST", "");
    vi.stubEnv("EMAIL_IMAP_USER", "");
    vi.stubEnv("EMAIL_IMAP_PASS", "");
    vi.stubEnv("EMAIL_KEYWORDS", "");
    vi.resetModules();
    const { buildApp } = await import("./app.js");
    app = buildApp();
  });

  afterAll(async () => {
    const { closeDatabase } = await import("./db.js");
    try {
      closeDatabase();
    } catch {
      /* ignore */
    }
    vi.unstubAllEnvs();
    rmSync(dataDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("GET /login renders for guests", async () => {
    const res = await request(app).get("/login").expect(200);
    expect(res.text).toMatch(/login|email/i);
  });

  it("GET / returns calendar HTML", async () => {
    const res = await request(app).get("/").query({ date: "2026-06-15" }).expect(200);
    expect(res.text).toMatch(/Manager Daily|calendar|task/i);
  });

  it("GET / with completed-bottom cookie orders open tasks before done in HTML", async () => {
    const { addTask, listTasks, toggleTask } = await import("./db.js");
    const day = "2026-07-15";
    addTask(day, "Done A", null);
    addTask(day, "Todo B", null);
    addTask(day, "Done C", null);
    const rows = listTasks(day);
    toggleTask(rows[0].id);
    toggleTask(rows[2].id);

    const res = await request(app)
      .get("/")
      .query({ date: day })
      .set("Cookie", "managerDailyTasksCompletedBottom=1")
      .expect(200);

    const idxB = res.text.indexOf("Todo B");
    const idxA = res.text.indexOf("Done A");
    const idxC = res.text.indexOf("Done C");
    expect(idxB).toBeGreaterThan(-1);
    expect(idxA).toBeGreaterThan(-1);
    expect(idxC).toBeGreaterThan(-1);
    expect(idxB < idxA && idxA < idxC).toBe(true);
  });

  it("POST /tasks adds a task and redirects with gamify params", async () => {
    const res = await request(app)
      .post("/tasks")
      .type("form")
      .send({ day: "2026-06-20", title: "Integration test task", notes: "" })
      .expect(302);
    expect(res.headers.location).toContain("date=2026-06-20");
    expect(res.headers.location).toContain("deskPetCreate=1");
  });

  it("POST /auth/login sets session cookie when credentials match", async () => {
    const { createUser } = await import("./db.js");
    const { hashPassword } = await import("./passwords.js");
    const email = `app-${Date.now()}@example.com`;
    createUser(email, hashPassword("correct-battery-horse"), "Test", "User");

    const res = await request(app)
      .post("/auth/login")
      .type("form")
      .send({ email, password: "correct-battery-horse", redirect: "/" })
      .expect(302);

    expect(res.headers["set-cookie"]?.some((c) => c.startsWith("md_session="))).toBe(true);
  });

  it("GET /api/desk-pet requires auth and returns saved state", async () => {
    await request(app).get("/api/desk-pet").expect(401);

    const { createUser } = await import("./db.js");
    const { hashPassword } = await import("./passwords.js");
    const email = `desk-pet-api-${Date.now()}@example.com`;
    createUser(email, hashPassword("sync-test-pass"), "Desk", "Pet");

    const login = await request(app)
      .post("/auth/login")
      .type("form")
      .send({ email, password: "sync-test-pass", redirect: "/" })
      .expect(302);
    const cookie = login.headers["set-cookie"];

    const empty = await request(app).get("/api/desk-pet").set("Cookie", cookie).expect(200);
    expect(empty.body.state).toBeNull();

    const payload = {
      v: 1,
      game: {
        fullness: 88,
        lastFullnessAt: "2026-05-16T10:00:00.000Z",
        tickleCount: 0,
        feedCount: 1,
        expired: false,
        alertedCute: false,
        alertedUrgent: false,
      },
      displayName: "Beebo",
      corner: "bl",
      palette: "ocean",
      uiCollapsed: true,
      updatedAt: "2026-05-16T10:00:00.000Z",
    };

    await request(app)
      .put("/api/desk-pet")
      .set("Cookie", cookie)
      .send({ state: payload })
      .expect(200);

    const got = await request(app).get("/api/desk-pet").set("Cookie", cookie).expect(200);
    expect(got.body.state).toMatchObject(payload);
  });

  it("PUT /api/desk-pet rejects invalid state body", async () => {
    const { createUser } = await import("./db.js");
    const { hashPassword } = await import("./passwords.js");
    const email = `desk-pet-bad-${Date.now()}@example.com`;
    createUser(email, hashPassword("pass"), null, null);
    const login = await request(app)
      .post("/auth/login")
      .type("form")
      .send({ email, password: "pass", redirect: "/" })
      .expect(302);
    const cookie = login.headers["set-cookie"];

    await request(app)
      .put("/api/desk-pet")
      .set("Cookie", cookie)
      .send({ state: { v: 1, game: { fullness: 999 } } })
      .expect(400);
  });
});

describe("task routes and desk-buddy redirect flashes", () => {
  let dataDir: string;
  let app: import("express").Express;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "manager-daily-app-tasks-"));
    vi.stubEnv("DATA_DIR", dataDir);
    vi.stubEnv("ATLASSIAN_SITE", "");
    vi.resetModules();
    const { buildApp } = await import("./app.js");
    app = buildApp();
  });

  afterAll(async () => {
    const { closeDatabase } = await import("./db.js");
    try {
      closeDatabase();
    } catch {
      /* ignore */
    }
    vi.unstubAllEnvs();
    rmSync(dataDir, { recursive: true, force: true });
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("POST /tasks/:id/toggle adds completion flash with task title", async () => {
    const { addTask, listTasks } = await import("./db.js");
    const day = "2026-10-05";
    addTask(day, "Finish me", null);
    const [row] = listTasks(day);

    const res = await request(app)
      .post(`/tasks/${row.id}/toggle`)
      .type("form")
      .send({ day })
      .expect(302);

    const loc = res.headers.location ?? "";
    expect(loc).toContain(`date=${day}`);
    expect(loc).toContain("deskPetComplete=1");
    expect(loc).not.toContain("deskPetCreate");
    const params = new URLSearchParams(loc.split("?")[1] ?? "");
    expect(params.get("taskTitle")).toBe("Finish me");
  });

  it("POST /tasks/:id/toggle marking open does not add completion flash", async () => {
    const { addTask, listTasks, toggleTask } = await import("./db.js");
    const day = "2026-10-06";
    addTask(day, "Reopen", null);
    const [row] = listTasks(day);
    toggleTask(row.id);

    const res = await request(app)
      .post(`/tasks/${row.id}/toggle`)
      .type("form")
      .send({ day })
      .expect(302);

    const loc = res.headers.location ?? "";
    expect(loc).not.toContain("deskPetComplete");
    expect(loc).not.toContain("taskTitle=");
  });

  it("POST /tasks/:id/delete adds removed and desk-pet remove flash params", async () => {
    const { addTask, listTasks } = await import("./db.js");
    const day = "2026-10-07";
    addTask(day, "Gone task", null);
    const [row] = listTasks(day);

    const res = await request(app)
      .post(`/tasks/${row.id}/delete`)
      .type("form")
      .send({ day })
      .expect(302);

    const loc = res.headers.location ?? "";
    expect(loc).toContain(`date=${day}`);
    expect(loc).toContain("taskRemoved=1");
    expect(loc).toContain("deskPetRemove=1");
    expect(new URLSearchParams(loc.split("?")[1] ?? "").get("taskTitle")).toBe("Gone task");
    expect(loc).not.toContain("deskPetCreate");
    expect(await listTasks(day)).toHaveLength(0);
  });

  describe("POST /carry-over", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 5, 20, 12, 0, 0));
    });

    it("copies open tasks from lookback days onto today with deskPetCarryOver", async () => {
      const { addTask, listTasks } = await import("./db.js");
      addTask("2026-06-18", "From Thursday", null);
      addTask("2026-06-19", "From Friday", null);

      const res = await request(app).post("/carry-over").expect(302);
      const loc = res.headers.location ?? "";

      expect(loc).toContain("date=2026-06-20");
      expect(loc).toContain("deskPetCarryOver=2");
      expect(loc).not.toContain("deskPetCreate");
      expect(listTasks("2026-06-20").map((t) => t.title).sort()).toEqual([
        "From Friday",
        "From Thursday",
      ]);
    });

    it("omits deskPetCarryOver when nothing new is copied", async () => {
      const { addTask } = await import("./db.js");
      addTask("2026-06-20", "Already today", null);
      addTask("2026-06-19", "Already today", null);

      const res = await request(app).post("/carry-over").expect(302);
      expect(res.headers.location).toBe("/?date=2026-06-20");
    });

    it("does not carry completed tasks", async () => {
      const { addTask, listTasks, toggleTask } = await import("./db.js");
      addTask("2026-06-19", "Still open", null);
      addTask("2026-06-19", "Was done", null);
      toggleTask(listTasks("2026-06-19").find((t) => t.title === "Was done")!.id);

      const res = await request(app).post("/carry-over").expect(302);
      expect(res.headers.location).toContain("deskPetCarryOver=1");
    });

    it("ignores source days outside the 14-day lookback", async () => {
      vi.setSystemTime(new Date(2026, 10, 15, 12, 0, 0));
      const { addTask, listTasks } = await import("./db.js");
      addTask("2026-10-20", "Too old", null);
      addTask("2026-11-14", "In window", null);

      const res = await request(app).post("/carry-over").expect(302);
      expect(res.headers.location).toContain("date=2026-11-15");
      expect(res.headers.location).toContain("deskPetCarryOver=1");
      expect(listTasks("2026-11-15").map((t) => t.title)).toEqual(["In window"]);
    });
  });
});
