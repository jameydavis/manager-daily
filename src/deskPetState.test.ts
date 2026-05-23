import { describe, expect, it } from "vitest";
import { deskPetSyncStateSchema, parseDeskPetSyncState } from "./deskPetState.js";

describe("deskPetSyncStateSchema", () => {
  const valid = {
    v: 1 as const,
    game: {
      fullness: 72,
      lastFullnessAt: "2026-05-16T12:00:00.000Z",
      tickleCount: 1,
      feedCount: 2,
      expired: false,
      alertedCute: false,
      alertedUrgent: false,
    },
    displayName: "Beebo",
    corner: "br" as const,
    palette: "ocean" as const,
    uiCollapsed: false,
    updatedAt: "2026-05-16T12:00:00.000Z",
  };

  it("accepts a valid payload", () => {
    expect(deskPetSyncStateSchema.safeParse(valid).success).toBe(true);
    expect(parseDeskPetSyncState(valid)).toEqual(valid);
  });

  it("accepts optional appearanceUpdatedAt for appearance-only sync", () => {
    const withAppearance = {
      ...valid,
      appearanceUpdatedAt: "2026-05-16T12:05:00.000Z",
      updatedAt: "2026-05-16T12:00:00.000Z",
    };
    expect(deskPetSyncStateSchema.safeParse(withAppearance).success).toBe(true);
    expect(parseDeskPetSyncState(withAppearance)).toEqual(withAppearance);
  });

  it("rejects invalid corner and fullness", () => {
    expect(parseDeskPetSyncState({ ...valid, corner: "xx" })).toBeNull();
    expect(parseDeskPetSyncState({ ...valid, game: { ...valid.game, fullness: 200 } })).toBeNull();
  });

  it("rejects malformed or partial payloads", () => {
    expect(parseDeskPetSyncState(null)).toBeNull();
    expect(parseDeskPetSyncState({ v: 2, game: valid.game })).toBeNull();
    expect(parseDeskPetSyncState({ ...valid, updatedAt: "" })).toBeNull();
    expect(parseDeskPetSyncState({ ...valid, displayName: "x".repeat(13) })).toBeNull();
  });
});
