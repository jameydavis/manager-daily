import { describe, it, expect } from "vitest";
import { formatLoggedTime } from "./reportAssigneeIssues.js";

describe("formatLoggedTime", () => {
  it("returns em dash for null, undefined, or non-positive", () => {
    expect(formatLoggedTime(null)).toBe("—");
    expect(formatLoggedTime(undefined)).toBe("—");
    expect(formatLoggedTime(0)).toBe("—");
    expect(formatLoggedTime(-10)).toBe("—");
  });

  it("formats hours only", () => {
    expect(formatLoggedTime(3600)).toBe("1h");
    expect(formatLoggedTime(7200)).toBe("2h");
  });

  it("formats minutes only", () => {
    expect(formatLoggedTime(60)).toBe("1m");
    expect(formatLoggedTime(300)).toBe("5m");
  });

  it("formats hours and minutes", () => {
    expect(formatLoggedTime(3660)).toBe("1h 1m");
    expect(formatLoggedTime(5400)).toBe("1h 30m");
  });

  it("returns <1m for sub-minute positive time", () => {
    expect(formatLoggedTime(30)).toBe("<1m");
    expect(formatLoggedTime(59)).toBe("<1m");
  });
});
