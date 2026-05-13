import { afterEach, describe, expect, it, vi } from "vitest";

describe("passwords", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("hashPassword and verifyPassword round-trip", async () => {
    vi.stubEnv("BCRYPT_ROUNDS", "10");
    const { hashPassword, verifyPassword, PASSWORD_MIN_LEN } = await import("./passwords.js");
    const plain = "a".repeat(PASSWORD_MIN_LEN);
    const hash = hashPassword(plain);
    expect(hash).not.toBe(plain);
    expect(verifyPassword(plain, hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });
});
