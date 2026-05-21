import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LEN } from "./passwords.js";
import { generateTemporaryPassword } from "./tempPassword.js";

describe("generateTemporaryPassword", () => {
  it("meets signup password rules", () => {
    for (let i = 0; i < 20; i++) {
      const pwd = generateTemporaryPassword();
      expect(pwd.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LEN);
      expect(pwd).toMatch(/[A-Za-z]/);
      expect(pwd).toMatch(/\d/);
    }
  });
});
