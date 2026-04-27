import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("timezone bootstrap", () => {
  let tzBefore: string | undefined;

  beforeEach(() => {
    tzBefore = process.env.TZ;
  });

  afterEach(() => {
    if (tzBefore === undefined) delete process.env.TZ;
    else process.env.TZ = tzBefore;
    vi.resetModules();
  });

  it("sets America/Indiana/Indianapolis when TZ is unset", async () => {
    delete process.env.TZ;
    vi.resetModules();
    await import("./timezone.js");
    expect(process.env.TZ).toBe("America/Indiana/Indianapolis");
  });

  it("does not override explicit TZ", async () => {
    process.env.TZ = "America/Los_Angeles";
    vi.resetModules();
    await import("./timezone.js");
    expect(process.env.TZ).toBe("America/Los_Angeles");
  });
});
