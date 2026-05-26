import { describe, expect, it, vi, afterEach } from "vitest";

describe("emailKeywords", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("parses comma and newline keywords", async () => {
    vi.stubEnv("EMAIL_KEYWORDS", "urgent, follow up\nASAP");
    vi.resetModules();
    const { parseEmailKeywords, emailKeywordsConfigured } = await import("./emailKeywords.js");
    expect(parseEmailKeywords(process.env.EMAIL_KEYWORDS)).toEqual(["urgent", "follow up", "asap"]);
    expect(emailKeywordsConfigured()).toBe(true);
  });

  it("matches keywords case-insensitively", async () => {
    const { textMatchesEmailKeywords } = await import("./emailKeywords.js");
    expect(textMatchesEmailKeywords("URGENT: Review this", ["urgent"])).toEqual(["urgent"]);
  });
});
