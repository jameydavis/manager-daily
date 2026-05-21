import { describe, it, expect } from "vitest";
import {
  atlassianSiteSchema,
  changePasswordBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  signupBodySchema,
} from "./authValidation.js";

const validSignupBase = {
  email: "a@example.com",
  password: "abc12345",
  firstName: "Pat",
  lastName: "Doe",
  atlassianSite: "https://org.atlassian.net",
  atlassianApiToken: "abcdefghijklmnopqrst",
  jiraBoardId: "1577",
};

describe("signupBodySchema", () => {
  it("accepts valid signup with Jira fields", () => {
    const r = signupBodySchema.safeParse(validSignupBase);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.jiraBoardId).toBe(1577);
      expect(r.data.atlassianSite).toBe("https://org.atlassian.net");
    }
  });

  it("rejects missing first name", () => {
    const r = signupBodySchema.safeParse({ ...validSignupBase, firstName: "" });
    expect(r.success).toBe(false);
  });

  it("rejects non-atlassian site host", () => {
    const r = signupBodySchema.safeParse({
      ...validSignupBase,
      atlassianSite: "https://example.com",
    });
    expect(r.success).toBe(false);
  });

  it("strips trailing slash from site", () => {
    const r = signupBodySchema.safeParse({
      ...validSignupBase,
      atlassianSite: "https://org.atlassian.net/",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.atlassianSite).toBe("https://org.atlassian.net");
  });

  it("rejects weak passwords", () => {
    const r = signupBodySchema.safeParse({ ...validSignupBase, password: "short1" });
    expect(r.success).toBe(false);
  });
});

describe("atlassianSiteSchema", () => {
  it("rejects http", () => {
    const r = atlassianSiteSchema.safeParse("http://x.atlassian.net");
    expect(r.success).toBe(false);
  });
});

describe("loginBodySchema", () => {
  it("accepts email and password", () => {
    const r = loginBodySchema.safeParse({ email: "x@example.com", password: "anything" });
    expect(r.success).toBe(true);
  });
});

describe("forgotPasswordBodySchema", () => {
  it("accepts a valid email", () => {
    expect(forgotPasswordBodySchema.safeParse({ email: "a@example.com" }).success).toBe(true);
  });
});

describe("changePasswordBodySchema", () => {
  it("requires matching confirmation", () => {
    const r = changePasswordBodySchema.safeParse({
      currentPassword: "oldpass9",
      newPassword: "newpass9",
      confirmPassword: "newpass8",
    });
    expect(r.success).toBe(false);
  });

  it("accepts valid change payload", () => {
    const r = changePasswordBodySchema.safeParse({
      currentPassword: "oldpass9",
      newPassword: "newpass9",
      confirmPassword: "newpass9",
    });
    expect(r.success).toBe(true);
  });
});
