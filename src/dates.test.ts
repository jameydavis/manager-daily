import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatDay,
  parseDay,
  today,
  sprintDaysLeftPhrase,
  prevCalendarDay,
  monthGrid,
} from "./dates.js";

describe("formatDay", () => {
  it("formats local calendar date as YYYY-MM-DD", () => {
    expect(formatDay(new Date(2026, 3, 9))).toBe("2026-04-09");
    expect(formatDay(new Date(2026, 0, 1))).toBe("2026-01-01");
  });
});

describe("parseDay", () => {
  it("parses valid ISO date strings", () => {
    const d = parseDay("2026-04-09");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(3);
    expect(d!.getDate()).toBe(9);
  });

  it("returns null for invalid patterns", () => {
    expect(parseDay("04-09-2026")).toBeNull();
    expect(parseDay("2026-4-9")).toBeNull();
    expect(parseDay("")).toBeNull();
  });

  it("returns null for impossible dates", () => {
    expect(parseDay("2026-02-30")).toBeNull();
  });
});

describe("today", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("matches formatDay of the mocked current instant", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 15, 15, 30, 0));
    expect(today()).toBe("2026-04-15");
  });
});

describe("sprintDaysLeftPhrase", () => {
  it("counts inclusive calendar days through sprint end", () => {
    expect(sprintDaysLeftPhrase("2026-04-26", "2026-04-28")).toBe("3 days left");
    expect(sprintDaysLeftPhrase("2026-04-28", "2026-04-28")).toBe("1 day left");
  });

  it("returns 0 days left when today is after end", () => {
    expect(sprintDaysLeftPhrase("2026-05-01", "2026-04-28")).toBe("0 days left");
  });
});

describe("prevCalendarDay", () => {
  it("returns previous calendar day", () => {
    expect(prevCalendarDay("2026-04-02")).toBe("2026-04-01");
    expect(prevCalendarDay("2026-01-01")).toBe("2025-12-31");
  });

  it("returns null for invalid input", () => {
    expect(prevCalendarDay("bad")).toBeNull();
  });
});

describe("monthGrid", () => {
  it("includes correct in-month and sprint flags for April 2026", () => {
    const weeks = monthGrid(2026, 3, "2026-04-10", "2026-04-01", "2026-04-30");
    const flat = weeks.flat();
    const apr9 = flat.find((c) => c.day === "2026-04-09");
    expect(apr9?.inMonth).toBe(true);
    expect(apr9?.isToday).toBe(false);
    const apr10 = flat.find((c) => c.day === "2026-04-10");
    expect(apr10?.isToday).toBe(true);
    expect(apr10?.inSprint).toBe(true);
  });

  it("marks out-of-range sprint days correctly", () => {
    const weeks = monthGrid(2026, 3, "2026-04-01", "2026-04-10", "2026-04-20");
    const apr5 = weeks.flat().find((c) => c.day === "2026-04-05");
    expect(apr5?.inSprint).toBe(false);
    const apr15 = weeks.flat().find((c) => c.day === "2026-04-15");
    expect(apr15?.inSprint).toBe(true);
  });
});
