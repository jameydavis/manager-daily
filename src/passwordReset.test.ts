import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./authMail.js", () => ({
  authMailDevFallbackEnabled: () => true,
  sendTemporaryPasswordEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("passwordReset", () => {
  let dataDir: string;
  let db: typeof import("./db.js");
  let requestPasswordReset: typeof import("./passwordReset.js").requestPasswordReset;
  let changeUserPassword: typeof import("./passwordReset.js").changeUserPassword;
  let hashPassword: typeof import("./passwords.js").hashPassword;
  let verifyPassword: typeof import("./passwords.js").verifyPassword;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "manager-daily-pw-reset-"));
    vi.stubEnv("DATA_DIR", dataDir);
    vi.resetModules();
    db = await import("./db.js");
    const pr = await import("./passwordReset.js");
    requestPasswordReset = pr.requestPasswordReset;
    changeUserPassword = pr.changeUserPassword;
    ({ hashPassword, verifyPassword } = await import("./passwords.js"));
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

  it("requestPasswordReset updates password and invalidates sessions", async () => {
    const email = `reset-${Date.now()}@example.com`;
    const oldHash = hashPassword("original-pass-9");
    const userId = db.createUser(email, oldHash, "Pat", "Lee");
    const token = db.createSession(userId, 3600);
    expect(db.consumeAndValidateSession(token)).not.toBeNull();

    const result = await requestPasswordReset(email);
    expect(result.ok).toBe(true);

    const row = db.findUserWithHashByEmail(email)!;
    expect(verifyPassword("original-pass-9", row.password_hash)).toBe(false);
    expect(db.consumeAndValidateSession(token)).toBeNull();
  });

  it("requestPasswordReset returns success for unknown email without sending", async () => {
    const { sendTemporaryPasswordEmail } = await import("./authMail.js");
    vi.mocked(sendTemporaryPasswordEmail).mockClear();
    const result = await requestPasswordReset(`missing-${Date.now()}@example.com`);
    expect(result.ok).toBe(true);
    expect(sendTemporaryPasswordEmail).not.toHaveBeenCalled();
  });

  it("changeUserPassword replaces hash when current password matches", () => {
    const email = `change-${Date.now()}@example.com`;
    const userId = db.createUser(email, hashPassword("current-9x"), null, null);
    const r = changeUserPassword(userId, "current-9x", "new-pass-8z");
    expect(r.ok).toBe(true);
    expect(verifyPassword("new-pass-8z", db.findUserWithHashById(userId)!.password_hash)).toBe(true);
  });

  it("changeUserPassword rejects wrong current password", () => {
    const email = `change-bad-${Date.now()}@example.com`;
    const userId = db.createUser(email, hashPassword("right-one-9"), null, null);
    const r = changeUserPassword(userId, "wrong-one-9", "new-pass-8z");
    expect(r.ok).toBe(false);
  });
});
