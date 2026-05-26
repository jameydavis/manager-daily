import { describe, expect, it, vi, afterEach } from "vitest";

describe("microsoftGraphConfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is false without client credentials", async () => {
    vi.resetModules();
    const { microsoftGraphConfigured } = await import("./microsoftGraph.js");
    expect(microsoftGraphConfigured()).toBe(false);
  });

  it("is true when client id and secret are set", async () => {
    vi.stubEnv("MS_GRAPH_CLIENT_ID", "abc");
    vi.stubEnv("MS_GRAPH_CLIENT_SECRET", "secret");
    vi.stubEnv("APP_BASE_URL", "http://127.0.0.1:3000");
    vi.resetModules();
    const { microsoftGraphConfigured, readMicrosoftGraphConfig, buildMicrosoftAuthorizeUrl } =
      await import("./microsoftGraph.js");
    expect(microsoftGraphConfigured()).toBe(true);
    const cfg = readMicrosoftGraphConfig();
    expect(cfg?.redirectUri).toBe("http://127.0.0.1:3000/auth/microsoft/callback");
    const url = buildMicrosoftAuthorizeUrl("state123");
    expect(url).toContain("login.microsoftonline.com");
    expect(url).toContain("client_id=abc");
    expect(url).toContain("state=state123");
    expect(url).toContain("Mail.Read");
  });
});
