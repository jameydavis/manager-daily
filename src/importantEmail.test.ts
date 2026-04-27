import { describe, it, expect, vi, afterEach } from "vitest";

describe("importantEmailConfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is false when any required piece missing", async () => {
    vi.stubEnv("EMAIL_IMAP_HOST", "imap.example.com");
    vi.stubEnv("EMAIL_IMAP_USER", "u");
    vi.stubEnv("EMAIL_IMAP_PASS", "p");
    vi.stubEnv("EMAIL_KEYWORDS", "");
    vi.resetModules();
    const { importantEmailConfigured } = await import("./importantEmail.js");
    expect(importantEmailConfigured()).toBe(false);
  });

  it("is true when host, user, pass, and keywords set", async () => {
    vi.stubEnv("EMAIL_IMAP_HOST", "imap.example.com");
    vi.stubEnv("EMAIL_IMAP_USER", "u");
    vi.stubEnv("EMAIL_IMAP_PASS", "p");
    vi.stubEnv("EMAIL_KEYWORDS", "urgent, deadline");
    vi.resetModules();
    const { importantEmailConfigured } = await import("./importantEmail.js");
    expect(importantEmailConfigured()).toBe(true);
  });
});
