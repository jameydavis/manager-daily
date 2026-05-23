import { describe, expect, it } from "vitest";
import { resolveJiraStatusTone } from "./client/jiraIssueStatus.js";

describe("resolveJiraStatusTone", () => {
  it("maps common workflow statuses to tone buckets", () => {
    expect(resolveJiraStatusTone("To Do")).toBe("todo");
    expect(resolveJiraStatusTone("In Progress")).toBe("progress");
    expect(resolveJiraStatusTone("In Review")).toBe("review");
    expect(resolveJiraStatusTone("Done")).toBe("done");
    expect(resolveJiraStatusTone("Blocked")).toBe("blocked");
    expect(resolveJiraStatusTone("On Hold")).toBe("blocked");
  });

  it("returns neutral for empty or placeholder labels", () => {
    expect(resolveJiraStatusTone("")).toBe("neutral");
    expect(resolveJiraStatusTone("—")).toBe("neutral");
    expect(resolveJiraStatusTone(null)).toBe("neutral");
  });

  it("returns default for unrecognized statuses", () => {
    expect(resolveJiraStatusTone("Icebox")).toBe("default");
  });

  it("is case-insensitive", () => {
    expect(resolveJiraStatusTone("IN PROGRESS")).toBe("progress");
    expect(resolveJiraStatusTone("ready for qa")).toBe("review");
  });
});
