import { describe, expect, it } from "vitest";
import {
  getAppearanceRevisionFromPayload,
  parseUpdatedAtMs,
  planDeskPetSyncMerge,
} from "./client/deskPetSyncMerge.js";

describe("parseUpdatedAtMs", () => {
  it("parses ISO timestamps and treats invalid values as zero", () => {
    expect(parseUpdatedAtMs("2026-05-23T23:43:46.404Z")).toBeGreaterThan(0);
    expect(parseUpdatedAtMs("")).toBe(0);
    expect(parseUpdatedAtMs("not-a-date")).toBe(0);
  });
});

describe("getAppearanceRevisionFromPayload", () => {
  it("prefers appearanceUpdatedAt over updatedAt", () => {
    expect(
      getAppearanceRevisionFromPayload({
        appearanceUpdatedAt: "2026-05-23T23:50:00.000Z",
        updatedAt: "2026-05-23T23:43:46.404Z",
      })
    ).toBe("2026-05-23T23:50:00.000Z");
  });

  it("falls back to updatedAt when appearance timestamp is absent", () => {
    expect(getAppearanceRevisionFromPayload({ updatedAt: "2026-05-23T23:43:46.404Z" })).toBe(
      "2026-05-23T23:43:46.404Z"
    );
  });
});

describe("planDeskPetSyncMerge", () => {
  it("applies remote game state when only game timestamps are newer", () => {
    expect(
      planDeskPetSyncMerge({
        localUpdatedAt: "2026-05-23T10:00:00.000Z",
        remoteUpdatedAt: "2026-05-23T23:43:46.404Z",
        localAppearanceUpdatedAt: "2026-05-23T23:50:00.000Z",
        remoteAppearanceUpdatedAt: "2026-05-23T23:43:46.404Z",
      })
    ).toEqual({
      applyRemoteGame: true,
      applyRemoteAppearance: false,
      shouldPushLocal: true,
    });
  });

  it("applies remote appearance when appearance revision is newer", () => {
    expect(
      planDeskPetSyncMerge({
        localUpdatedAt: "2026-05-23T23:50:00.000Z",
        remoteUpdatedAt: "2026-05-23T23:43:46.404Z",
        localAppearanceUpdatedAt: "2026-05-23T10:00:00.000Z",
        remoteAppearanceUpdatedAt: "2026-05-23T23:55:00.000Z",
      })
    ).toEqual({
      applyRemoteGame: false,
      applyRemoteAppearance: true,
      shouldPushLocal: true,
    });
  });

  it("seeds appearance from remote when local has no appearance revision", () => {
    expect(
      planDeskPetSyncMerge({
        localUpdatedAt: "",
        remoteUpdatedAt: "2026-05-23T23:43:46.404Z",
        localAppearanceUpdatedAt: "",
        remoteAppearanceUpdatedAt: "2026-05-23T23:43:46.404Z",
      })
    ).toEqual({
      applyRemoteGame: true,
      applyRemoteAppearance: true,
      shouldPushLocal: false,
    });
  });

  it("does nothing when timestamps match", () => {
    expect(
      planDeskPetSyncMerge({
        localUpdatedAt: "2026-05-23T12:00:00.000Z",
        remoteUpdatedAt: "2026-05-23T12:00:00.000Z",
        localAppearanceUpdatedAt: "2026-05-23T12:00:00.000Z",
        remoteAppearanceUpdatedAt: "2026-05-23T12:00:00.000Z",
      })
    ).toEqual({
      applyRemoteGame: false,
      applyRemoteAppearance: false,
      shouldPushLocal: false,
    });
  });
});
