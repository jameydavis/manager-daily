import { describe, expect, it } from "vitest";
import { formatDaysAgo, stalenessTone } from "./client/jiraStalenessDisplay.js";

describe("formatDaysAgo", () => {
  it("labels today without ago suffix", () => {
    expect(formatDaysAgo(0)).toBe("Today");
  });

  it("uses singular and plural ago copy", () => {
    expect(formatDaysAgo(1)).toBe("1 day ago");
    expect(formatDaysAgo(3)).toBe("3 days ago");
    expect(formatDaysAgo(14)).toBe("14 days ago");
  });
});

describe("stalenessTone", () => {
  it("buckets day counts for widget styling", () => {
    expect(stalenessTone(0)).toBe("fresh");
    expect(stalenessTone(2)).toBe("fresh");
    expect(stalenessTone(3)).toBe("normal");
    expect(stalenessTone(7)).toBe("normal");
    expect(stalenessTone(8)).toBe("stale");
    expect(stalenessTone(14)).toBe("stale");
    expect(stalenessTone(15)).toBe("old");
  });
});
