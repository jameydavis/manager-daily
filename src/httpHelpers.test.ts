import { describe, expect, it } from "vitest";
import {
  MAX_DESK_PET_QUEUE,
  homeForDay,
  safeRedirectPath,
  withTaskRemovedFlash,
} from "./httpHelpers.js";

describe("safeRedirectPath", () => {
  it("allows safe relative paths", () => {
    expect(safeRedirectPath("/tasks")).toBe("/tasks");
    expect(safeRedirectPath("/?date=2026-01-01")).toBe("/?date=2026-01-01");
  });

  it("rejects open redirects and non-paths", () => {
    expect(safeRedirectPath("//evil.com")).toBe("/");
    expect(safeRedirectPath("https://x")).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
    expect(safeRedirectPath("/\n")).toBe("/");
    expect(safeRedirectPath(123, "/fallback")).toBe("/fallback");
  });
});

describe("homeForDay", () => {
  it("sets date and optional desk pet params capped by max queue", () => {
    expect(homeForDay("2026-05-20")).toBe("/?date=2026-05-20");
    expect(homeForDay("2026-05-20", { create: 1, complete: 2 })).toBe(
      "/?date=2026-05-20&deskPetCreate=1&deskPetComplete=2"
    );
    const completed = homeForDay("2026-05-20", { complete: 1, completedTitle: "Ship it" });
    expect(completed).toContain("deskPetComplete=1");
    expect(new URLSearchParams(completed.split("?")[1]).get("taskTitle")).toBe("Ship it");
    expect(homeForDay("2026-05-20", { carryOver: 3 })).toBe("/?date=2026-05-20&deskPetCarryOver=3");
    expect(homeForDay("2026-05-20", { create: 999 })).toBe(
      `/?date=2026-05-20&deskPetCreate=${MAX_DESK_PET_QUEUE}`
    );
  });

  it("omits taskTitle when completion has no title", () => {
    const url = homeForDay("2026-05-20", { complete: 1, completedTitle: "   " });
    expect(url).toContain("deskPetComplete=1");
    expect(url).not.toContain("taskTitle=");
  });

  it("caps carryOver count at MAX_DESK_PET_QUEUE", () => {
    expect(homeForDay("2026-05-20", { carryOver: 999 })).toBe(
      `/?date=2026-05-20&deskPetCarryOver=${MAX_DESK_PET_QUEUE}`
    );
  });

  it("allows create and carryOver params together when both are set", () => {
    const url = homeForDay("2026-05-20", { create: 1, carryOver: 2 });
    expect(url).toContain("deskPetCreate=1");
    expect(url).toContain("deskPetCarryOver=2");
  });
});

describe("withTaskRemovedFlash", () => {
  it("appends flash params and truncates long titles", () => {
    expect(withTaskRemovedFlash("/?date=2026-01-02", "Hello")).toBe(
      "/?date=2026-01-02&taskRemoved=1&deskPetRemove=1&taskTitle=Hello"
    );
    expect(withTaskRemovedFlash("/?date=2026-01-02", null)).toBe(
      "/?date=2026-01-02&taskRemoved=1&deskPetRemove=1"
    );
    const long = "x".repeat(200);
    const out = withTaskRemovedFlash("/?date=2026-01-02", long);
    expect(out).toContain("taskRemoved=1");
    expect(out).toContain("deskPetRemove=1");
    expect(out).toContain("taskTitle=");
    const titleParam = new URLSearchParams(out.split("?")[1]).get("taskTitle");
    expect(titleParam?.length).toBe(120);
  });
});
